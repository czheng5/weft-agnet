import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { PostgresRuntimeStore } from '../src/core/runtime-store-postgres.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 't1', projectId: 'p1', workspaceId: 'w1' };

test('Postgres RuntimeStore contract via pg-mem', async () => {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  let clock = 1000;
  const store = new PostgresRuntimeStore({ pool, now: () => clock });
  try {
    await store.init();
    const thread = createThreadRecord({ scope, title: 'pg', status: 'open', now: 1000 });
    await store.createThread(thread);
    assert.equal((await store.getThread(thread.id))?.title, 'pg');

    const e1 = await store.appendEvent({ threadId: thread.id, type: 'thread.created', data: { ok: true }, idempotencyKey: 'k1' });
    const e1b = await store.appendEvent({ threadId: thread.id, type: 'thread.created', data: { ok: true }, idempotencyKey: 'k1' });
    assert.equal(e1.id, e1b.id);
    clock = 1001;
    const e2 = await store.appendEvent({ threadId: thread.id, type: 'thread.updated', data: {}, expectedSeq: 2 });
    assert.equal(e2.seq, 2);

    const lease = await store.acquireLease({ threadId: thread.id, scope, configVersion: 'cfg-1', model: 'deepseek-chat', sandbox: 'bwrap', ttlMs: 100 });
    assert.equal(lease.leaseUntil, 1101);
    await assert.rejects(() => store.acquireLease({ threadId: thread.id, scope, configVersion: 'cfg-1', model: 'deepseek-chat', sandbox: 'bwrap', ttlMs: 100 }), /active lease/);
    clock = 1150;
    assert.equal((await store.heartbeatLease(lease.id, 100, 1150)).leaseUntil, 1250);
    assert.equal((await store.listExpiredLeases(1300)).length, 1);

    await store.putMandate({ id: 'm1', threadId: thread.id, scope, capabilities: ['fs.read'], permissions: { read: ['**'], write: [], exec: [], network: [] }, createdAt: 1000, expiresAt: 2000, version: 1 });
    assert.equal((await store.getMandate(thread.id))?.id, 'm1');
    await store.putCapability({ name: 'demo', version: '1.0.0', description: 'd', tools: [], permissions: { read: [], write: [], exec: [], network: [] }, sandbox: 'bwrap', evals: [] });
    assert.equal((await store.listCapabilities()).length, 1);

    const outbox = await store.enqueueOutbox({ threadId: thread.id, topic: 'reply', payload: { text: 'hi' } });
    const claimed = await store.claimOutbox('worker-1', 10);
    assert.equal(claimed[0].id, outbox.id);
    assert.equal(claimed[0].claimedBy, 'worker-1');
    await store.completeOutbox(outbox.id);
  } finally {
    await store.close();
  }
});
