import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { startMemoryHubServer } from '../src/core/memoryhub-server.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(): MemoryRecord {
  const now = Date.now();
  return {
    id: 'server-1',
    scope: { tenantId: 't1', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'fact',
    content: 'server memory',
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: [],
    createdAt: now,
    updatedAt: now
  };
}

test('MemoryHub HTTP API write/search/get/forget/auth', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-server-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  const running = await startMemoryHubServer({ provider, token: 'secret' });
  const headers = { 'content-type': 'application/json', authorization: 'Bearer secret', 'x-weft-tenant': 't1', 'x-weft-user': 'u1', 'x-weft-project': 'p1' };
  try {
    const unauthorized = await fetch(running.url + '/health');
    assert.equal(unauthorized.status, 401);
    const health = await fetch(running.url + '/health', { headers });
    assert.equal(health.status, 200);

    const write = await fetch(running.url + '/memory/write', { method: 'POST', headers, body: JSON.stringify({ records: [record()] }) });
    assert.equal(write.status, 200);
    const writeJson = await write.json() as { receipts: Array<{ status: string }> };
    assert.equal(writeJson.receipts[0].status, 'committed');

    const search = await fetch(running.url + '/memory/search', { method: 'POST', headers, body: JSON.stringify({ text: 'server', topK: 3 }) });
    const searchJson = await search.json() as { hits: Array<{ record: { id: string } }> };
    assert.equal(searchJson.hits.length, 1);

    const get = await fetch(running.url + '/memory/server-1', { headers });
    assert.equal(get.status, 200);

    const forget = await fetch(running.url + '/memory/forget', { method: 'POST', headers, body: JSON.stringify({ ids: ['server-1'] }) });
    assert.equal(forget.status, 200);
  } finally {
    await running.close();
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
