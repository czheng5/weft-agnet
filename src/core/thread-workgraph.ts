import { validateThread } from './runtime-schema.ts';
import type { ThreadRecord } from './runtime-schema.ts';
import type { WorkGraph } from './workgraph.ts';

export function bindWorkGraphToThread(thread: ThreadRecord, graph: WorkGraph): WorkGraph {
  const record = validateThread(thread);
  if (graph.threadId && graph.threadId !== record.id) {
    throw new Error('work graph already bound to thread: ' + graph.threadId);
  }
  graph.threadId = record.id;
  return graph;
}

export function assertWorkGraphThread(thread: ThreadRecord, graph: WorkGraph): void {
  const record = validateThread(thread);
  if (!graph.threadId) throw new Error('work graph is not bound to a thread');
  if (graph.threadId !== record.id) throw new Error('work graph/thread mismatch');
}

export function threadTitleFromGraph(graph: WorkGraph): string {
  return graph.goal.text;
}
