import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import type { Principal, Role } from './access.ts';
import type { RevocationStore } from './token-revocation.ts';
import type { RuntimeScope } from './runtime-schema.ts';

export interface OidcConfig {
  issuer: string;
  audience: string;
  jwks: Record<string, unknown>[] | (() => Promise<Record<string, unknown>[]>);
  jwksRefresh?: () => Promise<Record<string, unknown>[]>;
  revocations?: RevocationStore;
  clockSkewSec?: number;
}

export class OidcError extends Error {
  constructor(message: string) {
    super('oidc: ' + message);
    this.name = 'OidcError';
  }
}

function decodePart(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new OidcError('malformed jwt segment');
  }
}

function getJwks(config: OidcConfig): Promise<Record<string, unknown>[]> {
  return typeof config.jwks === 'function' ? config.jwks() : Promise.resolve(config.jwks);
}

function algorithmFor(alg: string): string | null {
  if (alg === 'RS256') return 'RSA-SHA256';
  if (alg === 'RS384') return 'RSA-SHA384';
  if (alg === 'RS512') return 'RSA-SHA512';
  if (alg === 'EdDSA') return null;
  throw new OidcError('unsupported alg: ' + alg);
}

function audienceMatches(value: unknown, audience: string): boolean {
  if (typeof value === 'string') return value === audience;
  return Array.isArray(value) && value.includes(audience);
}

function roleFrom(value: unknown): Role {
  if (value === 'reader' || value === 'writer' || value === 'admin') return value;
  return 'reader';
}

export async function verifyOidcToken(token: string, config: OidcConfig, nowSec = Math.floor(Date.now() / 1000)): Promise<Principal> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new OidcError('jwt must have three segments');
  const header = decodePart(parts[0]) as Record<string, unknown>;
  const claims = decodePart(parts[1]) as Record<string, unknown>;
  if (typeof header.alg !== 'string') throw new OidcError('alg is required');
  let keys = await getJwks(config);
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  let jwk = kid ? keys.find((key) => key.kid === kid) : keys[0];
  if (!jwk && config.jwksRefresh) {
    keys = await config.jwksRefresh();
    jwk = kid ? keys.find((key) => key.kid === kid) : keys[0];
  }
  if (!jwk) throw new OidcError('no matching jwk');
  const key = createPublicKey({ key: jwk as never, format: 'jwk' });
  const signingInput = Buffer.from(parts[0] + '.' + parts[1], 'utf8');
  const signature = Buffer.from(parts[2], 'base64url');
  const algorithm = algorithmFor(header.alg);
  let valid = false;
  try {
    valid = algorithm === null ? cryptoVerify(null, signingInput, key, signature) : cryptoVerify(algorithm, signingInput, key, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new OidcError('signature invalid');
  if (claims.iss !== config.issuer) throw new OidcError('issuer mismatch');
  if (!audienceMatches(claims.aud, config.audience)) throw new OidcError('audience mismatch');
  const skew = config.clockSkewSec ?? 30;
  if (typeof claims.exp !== 'number' || claims.exp + skew <= nowSec) throw new OidcError('token expired');
  if (typeof claims.nbf === 'number' && claims.nbf - skew > nowSec) throw new OidcError('token not yet valid');
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) throw new OidcError('sub is required');
  if (typeof claims.jti !== 'string' || !claims.jti.trim()) throw new OidcError('jti is required');
  if (config.revocations?.isRevoked(claims.jti, nowSec * 1000)) throw new OidcError('token revoked');
  const scope: RuntimeScope = {
    tenantId: String(claims.tenant_id ?? claims.tenantId ?? ''),
    projectId: String(claims.project_id ?? claims.projectId ?? ''),
    workspaceId: String(claims.workspace_id ?? claims.workspaceId ?? '')
  };
  if (!scope.tenantId || !scope.projectId || !scope.workspaceId) throw new OidcError('tenant/project/workspace claims required');
  return { id: claims.sub, token, role: roleFrom(claims.role), scope };
}

export class OidcAuthenticator {
  private readonly config: OidcConfig;

  constructor(config: OidcConfig) {
    this.config = config;
  }

  async authenticate(authorization: string | undefined): Promise<Principal | null> {
    if (!authorization || !authorization.startsWith('Bearer ')) return null;
    try {
      return await verifyOidcToken(authorization.slice('Bearer '.length), this.config);
    } catch {
      return null;
    }
  }
}
