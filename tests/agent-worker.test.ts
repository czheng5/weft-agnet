import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { runAgentJob } from '../src/core/agent-worker.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';
import type { AgentResult } from '../src/core/agent.ts';

const scope: RuntimeScope = { tenantId: 'agent-t', projectId: 'agent-p', workspaceId: 'agent-w' };

const result: AgentResult = {
  content: 'done', sessionId: 's1', steps: 1, cacheReused: 0, toolCalls: 0, cacheReadTokens: 0, memoryInjected: 0
};

test('agent worker reads message event, runs AgentLoop seam and records result', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-agent-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const thread = createThreadRecord({ scope, title: 'agent', status: 'open', now: 1000 });
    await store.createThread(thread);
    const message = await store.appendEvent({ threadId: thread.id, type: 'message.user', data: { text: 'do work' } });
    const job = await store.enqueueOutbox({ threadId: thread.id, topic: 'worker.task', payload: { eventId: message.id } });
    let seen = '';
    const returned = await runAgentJob({
      store,
      createAgent: () => ({ run: async (task) => { seen = task; return result; } })
    }, job, thread);
    assert.equal(seen, 'do work');
    assert.equal(returned.content, 'done');
    const events = await store.listEvents(thread.id);
    assert.equal(events.some((event) => event.type === 'agent.result'), true);
    assert.equal((await store.listEvents(thread.id)).length, 2);

    await runAgentJob({
      store,
      createAgent: () => ({ run: async () => result })
    }, job, thread);
    assert.equal((await store.listEvents(thread.id)).length, 2);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
