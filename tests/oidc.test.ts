import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OidcAuthenticator, OidcError, verifyOidcToken } from '../src/core/oidc.ts';
import { FileRevocationStore } from '../src/core/token-revocation.ts';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'key-1' };

function token(overrides: Record<string, unknown> = {}): string {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'key-1' };
  const claims = {
    iss: 'https://issuer.example', aud: 'weft', sub: 'user-1', jti: 'jti-1', exp: Math.floor(Date.now() / 1000) + 3600,
    tenant_id: 't1', project_id: 'p1', workspace_id: 'w1', role: 'writer', ...overrides
  };
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const input = encode(header) + '.' + encode(claims);
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  return input + '.' + signer.sign(pair.privateKey).toString('base64url');
}

test('OIDC verifies RS256 claims and maps a Principal', async () => {
  const config = { issuer: 'https://issuer.example', audience: 'weft', jwks: [jwk] };
  const principal = await verifyOidcToken(token(), config, 1000);
  assert.equal(principal.id, 'user-1');
  assert.equal(principal.role, 'writer');
  assert.deepEqual(principal.scope, { tenantId: 't1', projectId: 'p1', workspaceId: 'w1' });
  assert.equal((await new OidcAuthenticator(config).authenticate('Bearer ' + token()))?.id, 'user-1');
  assert.equal(await new OidcAuthenticator(config).authenticate('Basic x'), null);
});

test('OIDC rejects expired, wrong audience, bad signature and revoked jti', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-oidc-'));
  try {
    const revocations = new FileRevocationStore(join(dir, 'revocations.json'));
    const config = { issuer: 'https://issuer.example', audience: 'weft', jwks: [jwk], revocations };
    await assert.rejects(() => verifyOidcToken(token({ exp: 900 }), config, 1000), /expired/);
    await assert.rejects(() => verifyOidcToken(token({ aud: 'other' }), config, 1000), /audience/);
    const bad = token();
    const parts = bad.split('.');
    const broken = parts[0] + '.' + parts[1] + '.' + Buffer.from('bad').toString('base64url');
    await assert.rejects(() => verifyOidcToken(broken, config, 1000), (error: unknown) => error instanceof OidcError);
    revocations.revoke('jti-1', 10_000_000, 1000);
    await assert.rejects(() => verifyOidcToken(token(), config, 1000), /revoked/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
