import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { WorkerPool } from '../src/core/worker-pool.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'worker-t', projectId: 'worker-p', workspaceId: 'worker-w' };

test('worker pool claims outbox, runs handler and completes job', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-worker-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const thread = createThreadRecord({ scope, title: 'work', status: 'open', now: 1000 });
    await store.createThread(thread);
    const job = await store.enqueueOutbox({ threadId: thread.id, topic: 'message.user', payload: { text: 'go' } });
    let seen = '';
    const pool = new WorkerPool({ store, workerId: 'w1', pollMs: 50, handler: async (j, t) => { seen = j.threadId + ':' + t.title; } });
    assert.equal(await pool.runOnce(), 1);
    assert.equal(seen, thread.id + ':work');
    assert.equal((await store.claimOutbox('w2', 10)).length, 0);
    assert.equal((await store.listExpiredLeases(2000)).length, 0);
    assert.equal(job.id.length > 0, true);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('worker pool defers job when thread lease is busy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-worker-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const thread = createThreadRecord({ scope, title: 'busy', status: 'open', now: 1000 });
    await store.createThread(thread);
    await store.acquireLease({ threadId: thread.id, scope, configVersion: 'cfg', model: 'm', sandbox: 'bwrap', ttlMs: 60_000 });
    await store.enqueueOutbox({ threadId: thread.id, topic: 'message.user', payload: {} });
    let called = false;
    const pool = new WorkerPool({ store, workerId: 'w1', handler: async () => { called = true; } });
    assert.equal(await pool.runOnce(), 0);
    assert.equal(called, false);
    assert.equal((await store.claimOutbox('w2', 10)).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
