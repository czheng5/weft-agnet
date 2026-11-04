import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkGraph } from '../src/core/workgraph.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import { bindWorkGraphToThread, assertWorkGraphThread } from '../src/core/thread-workgraph.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 't1', projectId: 'p1', workspaceId: 'w1' };

test('work graph binds to one runtime thread and survives JSON roundtrip', () => {
  const thread = createThreadRecord({ scope, title: 'bound', status: 'open', now: 1000 });
  const graph = new WorkGraph('thread goal');
  bindWorkGraphToThread(thread, graph);
  assert.equal(graph.threadId, thread.id);
  assert.doesNotThrow(() => assertWorkGraphThread(thread, graph));

  const restored = WorkGraph.fromJSON(graph.toJSON());
  assert.equal(restored.threadId, thread.id);
  assert.doesNotThrow(() => assertWorkGraphThread(thread, restored));
});

test('work graph cannot be rebound to another thread', () => {
  const a = createThreadRecord({ scope, title: 'a', status: 'open', now: 1000 });
  const b = createThreadRecord({ scope, title: 'b', status: 'open', now: 1000 });
  const graph = new WorkGraph('goal');
  bindWorkGraphToThread(a, graph);
  assert.throws(() => bindWorkGraphToThread(b, graph), /already bound/);
  assert.throws(() => assertWorkGraphThread(b, graph), /mismatch/);
  assert.throws(() => assertWorkGraphThread(a, new WorkGraph('unbound')), /not bound/);
});
