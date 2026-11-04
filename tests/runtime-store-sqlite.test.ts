import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 't1', projectId: 'p1', workspaceId: 'w1' };

test('sqlite runtime store persists threads, events and idempotency', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-runtime-'));
  const path = join(dir, 'runtime.db');
  let clock = 1000;
  const store = new SqliteRuntimeStore(path, { now: () => clock });
  try {
    const thread = createThreadRecord({ scope, title: 'demo', status: 'open', now: 1000 });
    await store.createThread(thread);
    assert.equal((await store.getThread(thread.id))?.title, 'demo');

    const e1 = await store.appendEvent({ threadId: thread.id, type: 'thread.created', data: { ok: true }, idempotencyKey: 'k1' });
    const e1b = await store.appendEvent({ threadId: thread.id, type: 'thread.created', data: { ok: true }, idempotencyKey: 'k1' });
    assert.equal(e1.id, e1b.id);
    assert.equal(e1.seq, 1);

    clock = 1001;
    const e2 = await store.appendEvent({ threadId: thread.id, type: 'thread.updated', data: {}, expectedSeq: 2 });
    assert.equal(e2.seq, 2);
    assert.equal((await store.listEvents(thread.id)).length, 2);
    await assert.rejects(() => store.appendEvent({ threadId: thread.id, type: 'bad', data: {}, expectedSeq: 1 }), /sequence conflict/);

    const updated = await store.updateThread({ ...thread, title: 'renamed', status: 'working', updatedAt: 1001 });
    assert.equal(updated.version, 2);
    await assert.rejects(() => store.updateThread(thread), /version conflict/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sqlite runtime store isolates tenant scopes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-runtime-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const a = createThreadRecord({ scope, title: 'a', status: 'open', now: 1000 });
    const b = createThreadRecord({ scope: { ...scope, tenantId: 't2' }, title: 'b', status: 'open', now: 1000 });
    await store.createThread(a);
    await store.createThread(b);
    assert.deepEqual((await store.listThreads(scope)).map((item) => item.id), [a.id]);
    assert.deepEqual((await store.listThreads({ ...scope, tenantId: 't2' })).map((item) => item.id), [b.id]);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sqlite runtime store enforces leases, mandates, capabilities and outbox', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-runtime-'));
  const path = join(dir, 'runtime.db');
  let clock = 1000;
  const store = new SqliteRuntimeStore(path, { now: () => clock });
  try {
    const thread = createThreadRecord({ scope, title: 'lease', status: 'open', now: 1000 });
    await store.createThread(thread);

    const lease = await store.acquireLease({ threadId: thread.id, scope, configVersion: 'cfg-1', model: 'deepseek-chat', sandbox: 'bwrap', ttlMs: 100 });
    assert.equal(lease.leaseUntil, 1100);
    await assert.rejects(() => store.acquireLease({ threadId: thread.id, scope, configVersion: 'cfg-1', model: 'deepseek-chat', sandbox: 'bwrap', ttlMs: 100 }), /active lease/);
    clock = 1150;
    const heart = await store.heartbeatLease(lease.id, 100, 1150);
    assert.equal(heart.leaseUntil, 1250);
    assert.equal((await store.listExpiredLeases(1200)).length, 0);
    assert.equal((await store.listExpiredLeases(1300)).length, 1);
    await store.releaseLease(lease.id);

    const mandate = {
      id: 'mandate-1', threadId: thread.id, scope, capabilities: ['fs.read'],
      permissions: { read: ['**'], write: [], exec: [], network: [] },
      createdAt: 1000, expiresAt: 2000, version: 1
    };
    await store.putMandate(mandate);
    assert.equal((await store.getMandate(thread.id))?.id, 'mandate-1');

    await store.putCapability({ name: 'demo', version: '1.0.0', description: 'd', tools: [], permissions: { read: [], write: [], exec: [], network: [] }, sandbox: 'bwrap', evals: [] });
    assert.equal((await store.getCapability('demo', '1.0.0'))?.version, '1.0.0');
    assert.equal((await store.listCapabilities()).length, 1);

    const outbox = await store.enqueueOutbox({ threadId: thread.id, topic: 'reply', payload: { text: 'hi' } });
    const claimed = await store.claimOutbox('worker-1', 10);
    assert.equal(claimed[0].id, outbox.id);
    assert.equal(claimed[0].claimedBy, 'worker-1');
    await store.completeOutbox(outbox.id);

    const retry = await store.enqueueOutbox({ threadId: thread.id, topic: 'reply2', payload: {} });
    await store.failOutbox(retry.id, 'boom', 9999);
    assert.equal((await store.claimOutbox('worker-2', 10)).some((item) => item.id === retry.id), false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
