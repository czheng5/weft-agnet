import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  const now = Date.now();
  return {
    id: 'mem-1',
    scope: { tenantId: 't1', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'preference',
    content: 'user prefers window seats',
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: ['evt-1'],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

test('memory contract: write/get/search/forget/scope', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-mem-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  try {
    const receipts = await provider.write([record()]);
    assert.equal(receipts[0].status, 'committed');
    const got = await provider.get('mem-1', { tenantId: 't1', userId: 'u1', projectId: 'p1' });
    assert.equal(got?.content, 'user prefers window seats');
    assert.equal(await provider.get('mem-1', { tenantId: 't2' }), null);
    const hits = await provider.search({ text: 'window seats', scope: { tenantId: 't1' } });
    assert.equal(hits.length, 1);
    const other = await provider.search({ text: 'window seats', scope: { tenantId: 't2' } });
    assert.equal(other.length, 0);
    const again = await provider.write([record({ version: 1 })]);
    assert.equal(again[0].status, 'committed');
    const stale = await provider.write([record({ version: 1, content: 'different' })]);
    assert.equal(stale[0].status, 'rejected');
    const forgotten = await provider.forget({ scope: { tenantId: 't1' }, ids: ['mem-1'] });
    assert.equal(forgotten.propagation, 'complete');
    const deleted = await provider.get('mem-1', { tenantId: 't1' });
    assert.equal(deleted?.status, 'deleted');
    const after = await provider.search({ text: 'window seats', scope: { tenantId: 't1' } });
    assert.equal(after.length, 0);
  } finally {
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
