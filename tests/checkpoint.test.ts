import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkGraph } from '../src/core/workgraph.ts';
import { planFromWorkGraph } from '../src/core/goal.ts';
import { createCheckpoint, CheckpointStore } from '../src/core/checkpoint.ts';

test('checkpoint captures plan and restores', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cp-'));
  try {
    const graph = new WorkGraph('checkpoint goal');
    graph.addTask({ title: 'one' });
    const plan = planFromWorkGraph(graph.goal, graph.allTasks());
    const checkpoint = createCheckpoint(plan, 'before-run');
    const store = new CheckpointStore(dir);
    store.save(checkpoint);
    assert.equal(store.latest()?.label, 'before-run');
    assert.equal(store.restore(checkpoint.id)?.tasks.length, 1);
    assert.equal(store.list().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
