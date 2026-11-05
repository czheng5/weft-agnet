import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

export interface OAuthStateRecord {
  state: string;
  expiresAt: number;
}

export class OAuthStateStore {
  private readonly states = new Map<string, OAuthStateRecord>();
  private readonly clock: () => number;

  constructor(now: () => number = Date.now) {
    this.clock = now;
  }

  create(ttlMs = 600_000): OAuthStateRecord {
    const record = { state: randomBytes(24).toString('base64url'), expiresAt: this.clock() + ttlMs };
    this.states.set(record.state, record);
    return record;
  }

  consume(state: string): boolean {
    const record = this.states.get(state);
    if (!record) return false;
    this.states.delete(state);
    return record.expiresAt > this.clock();
  }

  cleanup(now = this.clock()): number {
    let removed = 0;
    for (const [state, record] of this.states) {
      if (record.expiresAt <= now) { this.states.delete(state); removed += 1; }
    }
    return removed;
  }
}

export interface OAuthClientConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
}

export interface OAuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface BuildAuthorizationUrlInput {
  state: string;
  pkce: PkcePair;
  extra?: Record<string, string>;
}

function endpoint(value: string, name: string): string {
  if (!/^https?:\/\//.test(value)) throw new Error(name + ' must be http(s)');
  return value;
}

export function buildAuthorizationUrl(config: OAuthClientConfig, input: BuildAuthorizationUrlInput): string {
  if (!input.state.trim()) throw new Error('state is required');
  const url = new URL(endpoint(config.authorizationEndpoint, 'authorizationEndpoint'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.pkce.challenge);
  url.searchParams.set('code_challenge_method', input.pkce.method);
  if (config.scope) url.searchParams.set('scope', config.scope);
  for (const [key, value] of Object.entries(input.extra ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

async function tokenRequest(config: OAuthClientConfig, body: URLSearchParams, fetchImpl: typeof fetch): Promise<OAuthTokens> {
  if (config.clientSecret) body.set('client_secret', config.clientSecret);
  body.set('client_id', config.clientId);
  const response = await fetchImpl(endpoint(config.tokenEndpoint, 'tokenEndpoint'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString()
  });
  if (!response.ok) throw new Error('oauth token HTTP ' + response.status);
  const json = await response.json() as Partial<OAuthTokens>;
  if (typeof json.access_token !== 'string' || !json.access_token) throw new Error('access_token missing');
  if (typeof json.token_type !== 'string' || !json.token_type) throw new Error('token_type missing');
  return json as OAuthTokens;
}

export function exchangeAuthorizationCode(config: OAuthClientConfig, code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: verifier });
  return tokenRequest(config, body, fetchImpl);
}

export function refreshAccessToken(config: OAuthClientConfig, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return tokenRequest(config, body, fetchImpl);
}
