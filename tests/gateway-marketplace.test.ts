import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import { createCapabilityBundle, signCapabilityBundle } from '../src/core/marketplace.ts';
import type { PublisherKey } from '../src/core/marketplace.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'mkt-t', projectId: 'mkt-p', workspaceId: 'mkt-w' };

function signed() {
  const pair = generateKeyPairSync('ed25519');
  const key: PublisherKey = { id: 'pub-1', publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  const manifest = { schemaVersion: 1, id: 'mkt.demo', name: 'Market Demo', version: '1.0.0', description: 'demo', tools: [], permissions: { read: [], write: [], exec: [], network: [] }, sandbox: 'any' as const, evals: [] };
  const bundle = createCapabilityBundle('mkt.bundle', '1.0.0', [manifest]);
  return { key, bundle: signCapabilityBundle(bundle, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'acme', 'pub-1') };
}

test('marketplace UI and signed install endpoint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-mkt-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const { key, bundle } = signed();
  const gateway = new AgentGateway({ store, scope, token: 'admin', publisherKeys: [key] });
  try {
    const base = (await gateway.start(0)).url;
    const headers = { authorization: 'Bearer admin', 'content-type': 'application/json' };
    const page = await fetch(base + '/marketplace', { headers });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Weft Marketplace/);
    const installed = await fetch(base + '/marketplace/install', { method: 'POST', headers, body: JSON.stringify({ bundle }) });
    assert.equal(installed.status, 201);
    assert.equal((await store.listCapabilities()).length, 1);
    const keys = await fetch(base + '/marketplace/keys', { headers });
    assert.equal(keys.status, 200);
    const bad = await fetch(base + '/marketplace/install', { method: 'POST', headers, body: JSON.stringify({ bundle: { ...bundle, signature: 'bad' } }) });
    assert.equal(bad.status, 400);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
