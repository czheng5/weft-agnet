import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { createCapabilityBundle, installCapabilityBundle, BundleError } from '../src/core/marketplace.ts';

const manifest = {
  schemaVersion: 1, id: 'bundle.demo', name: 'Bundle Demo', version: '1.0.0', description: 'demo',
  tools: [], permissions: { read: [], write: [], exec: [], network: [] }, sandbox: 'any' as const, evals: []
};

test('capability bundle verifies checksum and installs atomically by validation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-bundle-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  try {
    const bundle = createCapabilityBundle('demo.bundle', '1.0.0', [manifest]);
    assert.equal(bundle.sha256.length, 64);
    const installed = await installCapabilityBundle(store, bundle);
    assert.equal(installed.length, 1);
    assert.equal((await store.getCapability('Bundle Demo', '1.0.0'))?.id, 'bundle.demo');
    assert.throws(() => createCapabilityBundle('demo.bundle', '1.0.0', []), BundleError);
    const tampered = { ...bundle, manifests: [{ ...manifest, description: 'changed' }] };
    await assert.rejects(() => installCapabilityBundle(store, tampered), /checksum mismatch/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
