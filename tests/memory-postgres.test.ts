import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { PostgresMemoryProvider } from '../src/core/memory-postgres.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(): MemoryRecord {
  const now = Date.now();
  return {
    id: 'pg-mem-1',
    scope: { tenantId: 't1', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'preference',
    content: 'postgres window seats',
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: ['evt-1'],
    createdAt: now,
    updatedAt: now
  };
}

test('Postgres MemoryProvider contract via pg-mem', async () => {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const provider = new PostgresMemoryProvider({ pool, id: 'pg-mem-test' });
  try {
    await provider.init();
    const receipts = await provider.write([record()]);
    assert.equal(receipts[0].status, 'committed');
    const got = await provider.get('pg-mem-1', { tenantId: 't1', userId: 'u1', projectId: 'p1' });
    assert.equal(got?.content, 'postgres window seats');
    assert.equal(await provider.get('pg-mem-1', { tenantId: 't2' }), null);
    const hits = await provider.search({ text: 'window seats', scope: { tenantId: 't1' } });
    assert.equal(hits.length, 1);
    const forgotten = await provider.forget({ scope: { tenantId: 't1' }, ids: ['pg-mem-1'] });
    assert.equal(forgotten.propagation, 'complete');
    const after = await provider.search({ text: 'window seats', scope: { tenantId: 't1' } });
    assert.equal(after.length, 0);
    assert.equal((await provider.health()).ok, true);
  } finally {
    await provider.close();
  }
});
