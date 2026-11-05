import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { JwksCache, JwksError } from '../src/core/jwks.ts';
import { verifyOidcToken } from '../src/core/oidc.ts';
import type { OidcConfig } from '../src/core/oidc.ts';

function rsaKey(kid: string) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey: pair.privateKey,
    jwk: { ...pair.publicKey.export({ format: 'jwk' }), kid }
  };
}

function token(privateKey: ReturnType<typeof rsaKey>['privateKey'], kid: string): string {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const claims = { iss: 'https://issuer.example', aud: 'weft', sub: 'u', jti: 'j', exp: Math.floor(Date.now() / 1000) + 3600, tenant_id: 't', project_id: 'p', workspace_id: 'w', role: 'writer' };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const input = encode(header) + '.' + encode(claims);
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  return input + '.' + signer.sign(privateKey).toString('base64url');
}

test('JWKS cache refreshes on rotated kid and OIDC verifies with refresh', async () => {
  const oldKey = rsaKey('old');
  const newKey = rsaKey('new');
  let calls = 0;
  const cache = new JwksCache({
    url: 'https://issuer.example/.well-known/jwks.json',
    now: () => 1000 + calls * 10_000,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ keys: calls === 1 ? [oldKey.jwk] : [newKey.jwk] }) } as Response;
    }
  });
  await cache.getKeys();
  await assert.rejects(() => cache.getKey('new'), JwksError);
  await cache.refresh();
  assert.equal((await cache.getKey('new')).kid, 'new');

  const config: OidcConfig = {
    issuer: 'https://issuer.example',
    audience: 'weft',
    jwks: [oldKey.jwk],
    jwksRefresh: async () => [newKey.jwk]
  };
  const principal = await verifyOidcToken(token(newKey.privateKey, 'new'), config);
  assert.equal(principal.id, 'u');
});
