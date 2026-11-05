import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import {
  BundleError,
  createCapabilityBundle,
  signCapabilityBundle,
  verifySignedCapabilityBundle,
  installSignedCapabilityBundle,
  fetchSignedMarketplaceIndex
} from '../src/core/marketplace.ts';
import type { PublisherKey } from '../src/core/marketplace.ts';

const manifest = {
  schemaVersion: 1, id: 'signed.demo', name: 'Signed Demo', version: '1.0.0', description: 'demo',
  tools: [], permissions: { read: [], write: [], exec: [], network: [] }, sandbox: 'any' as const, evals: []
};

function keys(): { privatePem: string; key: PublisherKey } {
  const pair = generateKeyPairSync('ed25519');
  return {
    privatePem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    key: { id: 'pub-1', publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  };
}

test('signed marketplace verifies publisher, tamper, revocation and expiry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-signed-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const { privatePem, key } = keys();
  try {
    const bundle = createCapabilityBundle('signed.bundle', '1.0.0', [manifest]);
    const signed = signCapabilityBundle(bundle, privatePem, 'acme', 'pub-1', 2000);
    assert.doesNotThrow(() => verifySignedCapabilityBundle(signed, [key], 1000));
    await installSignedCapabilityBundle(store, signed, [key], 1000);
    assert.equal((await store.getCapability('Signed Demo', '1.0.0'))?.id, 'signed.demo');

    const tampered = { ...signed, manifests: [{ ...manifest, description: 'changed' }] };
    assert.throws(() => verifySignedCapabilityBundle(tampered, [key], 1000), /checksum/);
    const wrongSig = { ...signed, signature: Buffer.from('bad').toString('base64') };
    assert.throws(() => verifySignedCapabilityBundle(wrongSig, [key], 1000), /signature/);
    assert.throws(() => verifySignedCapabilityBundle(signed, [], 1000), /unknown/);
    assert.throws(() => verifySignedCapabilityBundle(signed, [{ ...key, revokedAt: 900 }], 1000), /revoked/);
    assert.throws(() => verifySignedCapabilityBundle(signed, [key], 3000), /expired/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remote marketplace index is fetched and verified', async () => {
  const { privatePem, key } = keys();
  const bundle = createCapabilityBundle('remote.bundle', '1.0.0', [manifest]);
  const signed = signCapabilityBundle(bundle, privatePem, 'acme', 'pub-1');
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ bundles: [signed] }) }) as Response;
  const list = await fetchSignedMarketplaceIndex('https://market.example/index.json', [key], fakeFetch);
  assert.equal(list.length, 1);
  assert.throws(() => verifySignedCapabilityBundle(list[0], [{ ...key, revokedAt: 1 }], 1000), BundleError);
});
