import { WorkGraphStore } from './workgraph.ts';
import type { WorkGraph } from './workgraph.ts';
import { CapabilityRegistry } from './capabilities.ts';
import type { CapabilityRecord } from './capabilities.ts';
import { SchedulerStore } from './scheduler.ts';
import type { SchedulerJob } from './scheduler.ts';
import { CheckpointStore } from './checkpoint.ts';
import type { Checkpoint } from './checkpoint.ts';
import { createThreadRecord } from './runtime-schema.ts';
import type { RuntimeScope, ThreadRecord } from './runtime-schema.ts';
import { bindWorkGraphToThread } from './thread-workgraph.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface V1Snapshot {
  workgraph: WorkGraph | null;
  capabilities: CapabilityRecord[];
  scheduler: SchedulerJob[];
  checkpoints: Checkpoint[];
}

export function readV1Snapshot(workspace: string): V1Snapshot {
  return {
    workgraph: new WorkGraphStore(workspace).load(),
    capabilities: new CapabilityRegistry(workspace).list(),
    scheduler: new SchedulerStore(workspace).load(),
    checkpoints: new CheckpointStore(workspace).list()
  };
}

export function hasV1State(workspace: string): boolean {
  const snapshot = readV1Snapshot(workspace);
  return Boolean(snapshot.workgraph) || snapshot.capabilities.length > 0 || snapshot.checkpoints.length > 0;
}

function threadStatusFromGoal(status: WorkGraph['goal']['status']): ThreadRecord['status'] {
  if (status === 'done') return 'done';
  if (status === 'abandoned') return 'stopped';
  return 'open';
}

export async function migrateV1ToRuntime(workspace: string, store: RuntimeStore, scope: RuntimeScope, now = Date.now()): Promise<{ thread: ThreadRecord; graph: WorkGraph; capabilities: CapabilityRecord[] }> {
  const snapshot = readV1Snapshot(workspace);
  if (!snapshot.workgraph) throw new Error('no v1 work graph to migrate');
  const thread = createThreadRecord({
    scope,
    title: snapshot.workgraph.goal.text,
    status: threadStatusFromGoal(snapshot.workgraph.goal.status),
    now
  });
  await store.createThread(thread);
  const graph = bindWorkGraphToThread(thread, snapshot.workgraph);
  await store.appendEvent({
    threadId: thread.id,
    type: 'thread.migrated',
    data: { source: 'v1', goalId: graph.goal.id },
    idempotencyKey: 'v1-migrate:' + thread.id
  });
  for (const capability of snapshot.capabilities) {
    await store.putCapability(capability.manifest);
  }
  return { thread, graph, capabilities: snapshot.capabilities };
}
