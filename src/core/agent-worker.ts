import type { OutboxRecord, ThreadRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';
import type { AgentResult } from './agent.ts';

export interface AgentRunner {
  run(task: string): Promise<AgentResult>;
}

export interface AgentWorkerOptions {
  store: RuntimeStore;
  createAgent: (thread: ThreadRecord, job: OutboxRecord) => AgentRunner;
}

function payloadEventId(job: OutboxRecord): string | null {
  if (!job.payload || typeof job.payload !== 'object') return null;
  const value = (job.payload as { eventId?: unknown }).eventId;
  return typeof value === 'string' ? value : null;
}

export async function runAgentJob(opts: AgentWorkerOptions, job: OutboxRecord, thread: ThreadRecord): Promise<AgentResult> {
  const eventId = payloadEventId(job);
  if (!eventId) throw new Error('agent job payload has no eventId');
  const events = await opts.store.listEvents(thread.id, 0, 1000);
  const message = events.find((event) => event.id === eventId);
  if (!message) throw new Error('agent job message not found: ' + eventId);
  const text = message.data && typeof message.data === 'object' && typeof (message.data as { text?: unknown }).text === 'string'
    ? (message.data as { text: string }).text
    : '';
  if (!text.trim()) throw new Error('agent job message is empty');
  const agent = opts.createAgent(thread, job);
  const result = await agent.run(text);
  await opts.store.appendEvent({
    threadId: thread.id,
    type: 'agent.result',
    data: result,
    idempotencyKey: 'agent-result:' + job.id
  });
  return result;
}

export function createAgentWorkerHandler(opts: AgentWorkerOptions): (job: OutboxRecord, thread: ThreadRecord) => Promise<void> {
  return async (job, thread) => {
    await runAgentJob(opts, job, thread);
  };
}
