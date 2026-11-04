import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { Router } from '../src/core/router.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'router-t', projectId: 'router-p', workspaceId: 'router-w' };

test('router admits messages, enqueues jobs and honors idempotency', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-router-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const thread = createThreadRecord({ scope, title: 'route', status: 'open', now: 1000 });
    await store.createThread(thread);
    const router = new Router({ store, now: () => 1000 });
    const first = await router.route(thread, 'hello');
    assert.equal(first.accepted, true);
    assert.equal(first.event?.seq, 1);
    assert.equal((await store.claimOutbox('w', 10)).length, 1);

    const duplicate = await router.route(thread, 'hello', { idempotencyKey: 'r1' });
    const duplicateAgain = await router.route(thread, 'hello', { idempotencyKey: 'r1' });
    assert.equal(duplicate.event?.id, duplicateAgain.event?.id);
    assert.equal(duplicate.job, undefined);
    assert.equal((await router.route(thread, '   ')).accepted, false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('router enforces mandate capability and expiry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-router-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const thread = createThreadRecord({ scope, title: 'mandate', status: 'open', now: 1000 });
    await store.createThread(thread);
    const router = new Router({ store, now: () => 1000 });
    await store.putMandate({
      id: 'm1', threadId: thread.id, scope, capabilities: ['fs.read'],
      permissions: { read: ['**'], write: [], exec: [], network: [] },
      createdAt: 1000, expiresAt: 2000, version: 1
    });
    assert.equal((await router.route(thread, 'blocked', { capability: 'fs.write' })).accepted, false);
    assert.equal((await router.route(thread, 'allowed', { capability: 'fs.read' })).accepted, true);
    await store.putMandate({
      id: 'm2', threadId: thread.id, scope, capabilities: ['fs.read'],
      permissions: { read: ['**'], write: [], exec: [], network: [] },
      createdAt: 500, expiresAt: 999, version: 2
    });
    assert.equal((await router.route(thread, 'expired', { capability: 'fs.read' })).accepted, false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
