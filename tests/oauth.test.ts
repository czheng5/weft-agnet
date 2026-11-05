import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OAuthStateStore, buildAuthorizationUrl, createPkcePair, exchangeAuthorizationCode, refreshAccessToken } from '../src/core/oauth.ts';

test('PKCE, state and authorization URL are correct', () => {
  const pkce = createPkcePair();
  assert.equal(pkce.challenge, createHash('sha256').update(pkce.verifier).digest('base64url'));
  const store = new OAuthStateStore(() => 1000);
  const record = store.create(100);
  assert.equal(store.consume(record.state), true);
  assert.equal(store.consume(record.state), false);
  const expired = store.create(0);
  assert.equal(store.consume(expired.state), false);
  const clockStore = new OAuthStateStore(() => 2000);
  const stale = clockStore.create(0);
  assert.equal(clockStore.consume(stale.state), false);
  const url = new URL(buildAuthorizationUrl({
    authorizationEndpoint: 'https://idp.example/authorize',
    tokenEndpoint: 'https://idp.example/token',
    clientId: 'weft',
    redirectUri: 'http://127.0.0.1/callback',
    scope: 'openid profile'
  }, { state: 'state-1', pkce }));
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'state-1');
});

test('authorization-code exchange sends PKCE verifier and refresh works', async () => {
  const calls: string[] = [];
  const fakeFetch = async (_url: string, init?: RequestInit) => {
    calls.push(String(init?.body ?? ''));
    return {
      ok: true,
      status: 200,
      json: async () => calls.length === 1
        ? { access_token: 'access-1', token_type: 'Bearer', refresh_token: 'refresh-1', id_token: 'id-1' }
        : { access_token: 'access-2', token_type: 'Bearer' }
    } as Response;
  };
  const config = {
    authorizationEndpoint: 'https://idp.example/authorize',
    tokenEndpoint: 'https://idp.example/token',
    clientId: 'weft',
    redirectUri: 'http://127.0.0.1/callback'
  };
  const tokens = await exchangeAuthorizationCode(config, 'code-1', 'verifier-1', fakeFetch as typeof fetch);
  assert.equal(tokens.access_token, 'access-1');
  assert.match(calls[0], /code_verifier=verifier-1/);
  assert.match(calls[0], /grant_type=authorization_code/);
  const refreshed = await refreshAccessToken(config, 'refresh-1', fakeFetch as typeof fetch);
  assert.equal(refreshed.access_token, 'access-2');
  assert.match(calls[1], /grant_type=refresh_token/);
  await assert.rejects(() => exchangeAuthorizationCode(config, 'code', 'v', (async () => ({ ok: false, status: 400 }) as Response) as typeof fetch), /HTTP 400/);
});
