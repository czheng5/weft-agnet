import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { Workboard } from '../src/core/workboard.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'pm-t', projectId: 'pm-p', workspaceId: 'pm-w' };

test('workboard aggregates priority, due and progress', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-pm-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const high = createThreadRecord({ scope, title: 'high', status: 'working', priority: 'high', owner: 'alice', dueAt: 2000, now: 1000 });
    const overdue = createThreadRecord({ scope, title: 'overdue', status: 'open', priority: 'low', owner: 'bob', dueAt: 500, now: 1000 });
    await store.createThread(high);
    await store.createThread(overdue);
    const msg = await store.appendEvent({ threadId: high.id, type: 'message.user', data: { text: 'go' } });
    await store.appendEvent({ threadId: high.id, type: 'agent.result', data: { content: 'done' } });
    const board = new Workboard(store);
    const items = await board.list(scope, 1500);
    assert.equal(items[0].thread.id, high.id);
    assert.equal(items[0].progress, 100);
    assert.equal(items[0].messageCount, 1);
    assert.equal(items.some((item) => item.overdue), true);
    const summary = await board.summary(scope, 1500);
    assert.equal(summary.total, 2);
    assert.equal(summary.highPriority, 1);
    assert.equal(summary.overdue, 1);
    assert.equal(msg.seq, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gateway accepts project metadata and exposes workboard', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-pm-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const gateway = new AgentGateway({ store, scope });
  try {
    const base = (await gateway.start(0)).url;
    const created = await fetch(base + '/threads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'pm', priority: 'critical', owner: 'alice', dueAt: 9999999999999, labels: ['ic'] }) });
    assert.equal(created.status, 201);
    const thread = ((await created.json()) as { thread: { priority: string; owner: string; labels: string[] } }).thread;
    assert.equal(thread.priority, 'critical');
    assert.equal(thread.owner, 'alice');
    assert.deepEqual(thread.labels, ['ic']);
    const board = await fetch(base + '/workboard');
    assert.equal(board.status, 200);
    assert.equal(((await board.json()) as { summary: { total: number } }).summary.total, 1);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
