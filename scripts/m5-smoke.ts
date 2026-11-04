import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import { WorkerPool } from '../src/core/worker-pool.ts';
import { createAgentWorkerHandler } from '../src/core/agent-worker.ts';

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'weft-m5-smoke-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const scope = { tenantId: 'smoke', projectId: 'm5', workspaceId: dir };
  const gateway = new AgentGateway({ store, scope });
  const pool = new WorkerPool({
    store,
    workerId: 'smoke-worker',
    sandbox: 'workspace-guard',
    handler: createAgentWorkerHandler({
      store,
      createAgent: () => ({
        run: async (task) => ({ content: 'echo:' + task, sessionId: 'smoke', steps: 1, cacheReused: 0, toolCalls: 0, cacheReadTokens: 0, memoryInjected: 0 })
      })
    })
  });
  try {
    const address = await gateway.start(0);
    const created = await fetch(address.url + '/threads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'smoke' }) });
    const thread = ((await created.json()) as { thread: { id: string } }).thread;
    const posted = await fetch(address.url + '/threads/' + thread.id + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'end to end' }) });
    if (posted.status !== 202) throw new Error('message not accepted: ' + posted.status);
    const processed = await pool.runOnce();
    if (processed !== 1) throw new Error('worker did not process job');
    const events = await fetch(address.url + '/threads/' + thread.id + '/events');
    const body = await events.json() as { events: Array<{ type: string; data: { content?: string } }> };
    const result = body.events.find((event) => event.type === 'agent.result');
    if (!result) throw new Error('agent.result missing');
    if (result.data.content !== 'echo:end to end') throw new Error('agent result mismatch');
    console.log('M5 E2E PASS');
    console.log('  thread=' + thread.id);
    console.log('  events=' + body.events.length + ' result=' + result.data.content);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('M5 E2E FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
