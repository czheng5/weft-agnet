import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'gateway-t', projectId: 'gateway-p', workspaceId: 'gateway-w' };

test('agent gateway accepts threads, messages and exposes events', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-gateway-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  const gateway = new AgentGateway({ store, scope, token: 'test-token' });
  try {
    const address = await gateway.start(0);
    const base = address.url;

    const unauthorized = await fetch(base + '/health');
    assert.equal(unauthorized.status, 401);

    const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
    const health = await fetch(base + '/health', { headers });
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { ok: boolean }).ok, true);

    const created = await fetch(base + '/threads', { method: 'POST', headers, body: JSON.stringify({ title: 'first thread' }) });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { thread: { id: string }; event: { seq: number } };
    assert.equal(createdBody.thread.id.startsWith('thread-'), true);
    assert.equal(createdBody.event.seq, 1);

    const message = await fetch(base + '/threads/' + createdBody.thread.id + '/messages', {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': 'msg-1' },
      body: JSON.stringify({ text: 'hello gateway' })
    });
    assert.equal(message.status, 202);
    const messageBody = await message.json() as { event: { id: string; seq: number }; jobId: string | null };
    assert.equal(messageBody.event.seq, 2);
    assert.equal(messageBody.jobId, null);

    const duplicate = await fetch(base + '/threads/' + createdBody.thread.id + '/messages', {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': 'msg-1' },
      body: JSON.stringify({ text: 'hello gateway' })
    });
    assert.equal(duplicate.status, 202);
    assert.equal((await duplicate.json() as { event: { id: string } }).event.id, messageBody.event.id);

    const events = await fetch(base + '/threads/' + createdBody.thread.id + '/events?after=1', { headers });
    assert.equal(events.status, 200);
    const eventBody = await events.json() as { events: Array<{ seq: number; type: string }> };
    assert.equal(eventBody.events.length, 1);
    assert.equal(eventBody.events[0].type, 'message.user');

    const thread = await fetch(base + '/threads/' + createdBody.thread.id, { headers });
    assert.equal(thread.status, 200);
    assert.equal((await thread.json() as { thread: { title: string } }).thread.title, 'first thread');
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
