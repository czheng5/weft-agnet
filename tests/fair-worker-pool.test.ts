import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { FairWorkerPool } from '../src/core/fair-worker-pool.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

function scope(tenantId: string): RuntimeScope {
  return { tenantId, projectId: 'fair-p', workspaceId: 'fair-w' };
}

test('weighted fair pool respects tenant weights', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-fair-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    for (const tenant of ['a', 'b']) {
      for (let i = 0; i < 3; i += 1) {
        const thread = createThreadRecord({ scope: scope(tenant), title: tenant + i, status: 'open', now: 1000 });
        await store.createThread(thread);
        await store.enqueueOutbox({ threadId: thread.id, topic: 'worker.task', payload: {} });
      }
    }
    const seen: string[] = [];
    const pool = new FairWorkerPool({ store, workerId: 'weighted', concurrency: 3, weights: { a: 2, b: 1 }, handler: async (_job, thread) => { seen.push(thread.scope.tenantId); } });
    await pool.runOnce();
    assert.deepEqual(seen, ['a', 'a', 'b']);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fair worker pool serves multiple tenants round-robin', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-fair-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    for (const tenant of ['a', 'b', 'c']) {
      const thread = createThreadRecord({ scope: scope(tenant), title: tenant, status: 'open', now: 1000 });
      await store.createThread(thread);
      await store.enqueueOutbox({ threadId: thread.id, topic: 'worker.task', payload: { tenant } });
    }
    const seen: string[] = [];
    const pool = new FairWorkerPool({
      store,
      workerId: 'fair-1',
      concurrency: 2,
      handler: async (_job, thread) => { seen.push(thread.scope.tenantId); }
    });
    assert.equal(await pool.runOnce(), 2);
    assert.equal(new Set(seen).size, 2);
    assert.equal(await pool.runOnce(), 1);
    assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
    assert.equal((await store.claimOutbox('other', 10)).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
