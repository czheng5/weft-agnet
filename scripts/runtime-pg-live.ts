import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PostgresRuntimeStore } from '../src/core/runtime-store-postgres.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';

async function main(): Promise<void> {
  const connectionString = process.env.WEFT_PG_URL ?? 'postgres://postgres:weft@127.0.0.1:55432/weft';
  const pool = new Pool({ connectionString });
  const store = new PostgresRuntimeStore({ pool, now: () => Date.now() });
  const scope = { tenantId: 'pg-contract-' + randomUUID(), projectId: 'p1', workspaceId: 'w1' };
  let threadId = '';
  try {
    await store.init();
    const thread = createThreadRecord({ scope, title: 'runtime pg contract', status: 'open' });
    threadId = thread.id;
    await store.createThread(thread);
    const event = await store.appendEvent({ threadId, type: 'thread.created', data: { ok: true }, idempotencyKey: 'pg:' + threadId });
    const duplicate = await store.appendEvent({ threadId, type: 'thread.created', data: { ok: true }, idempotencyKey: 'pg:' + threadId });
    if (duplicate.id !== event.id) throw new Error('event idempotency failed');
    const lease = await store.acquireLease({ threadId, scope, configVersion: 'cfg-1', model: 'deepseek-chat', sandbox: 'bwrap', ttlMs: 60000 });
    await store.heartbeatLease(lease.id, 60000);
    await store.putMandate({ id: 'pg-mandate-' + randomUUID(), threadId, scope, capabilities: ['fs.read'], permissions: { read: ['**'], write: [], exec: [], network: [] }, createdAt: Date.now(), expiresAt: Date.now() + 60000, version: 1 });
    await store.putCapability({ id: 'pg.demo', name: 'PG Demo', version: '1.0.0', description: 'pg contract', instructions: 'run', tools: [], permissions: { read: [], write: [], exec: [], network: [] }, sandbox: 'any', evals: [] });
    const outbox = await store.enqueueOutbox({ threadId, topic: 'reply', payload: { ok: true } });
    const claimed = await store.claimOutbox('pg-worker', 1);
    if (claimed[0]?.id !== outbox.id) throw new Error('outbox claim failed');
    await store.completeOutbox(outbox.id);
    const threads = await store.listThreads(scope);
    const caps = await store.listCapabilities();
    if (threads.length !== 1 || threads[0].id !== threadId) throw new Error('scope thread list failed');
    if (!caps.some((item) => item.id === 'pg.demo')) throw new Error('capability id lost');
    console.log('RUNTIME PG CONTRACT PASS');
    console.log('  thread=' + threadId);
    console.log('  eventSeq=' + event.seq + ' idempotent=true');
    console.log('  leases=1 mandates=1 capabilities=' + caps.length + ' outbox=1');
  } finally {
    try {
      if (threadId) {
        await pool.query('DELETE FROM runtime_outbox WHERE thread_id=$1', [threadId]);
        await pool.query('DELETE FROM runtime_worker_leases WHERE thread_id=$1', [threadId]);
        await pool.query('DELETE FROM runtime_mandates WHERE thread_id=$1', [threadId]);
        await pool.query('DELETE FROM runtime_events WHERE thread_id=$1', [threadId]);
        await pool.query('DELETE FROM runtime_threads WHERE id=$1', [threadId]);
      }
      await pool.query('DELETE FROM runtime_capabilities WHERE id=$1', ['pg.demo']);
    } catch (error) {
      console.error('cleanup warning: ' + (error instanceof Error ? error.message : String(error)));
    }
    await store.close();
  }
}

main().catch((error) => {
  console.error('RUNTIME PG CONTRACT FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
