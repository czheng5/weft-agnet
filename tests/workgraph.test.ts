import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkGraph, WorkGraphStore } from '../src/core/workgraph.ts';

test('WorkGraph DAG readiness and todo projection', () => {
  const graph = new WorkGraph('ship M2 foundation');
  const a = graph.addTask({ title: 'schema' });
  const b = graph.addTask({ title: 'runtime', dependsOn: [a.id] });
  const c = graph.addTask({ title: 'scheduler', dependsOn: [a.id] });
  assert.deepEqual(graph.nextReady().map((t) => t.title), ['schema']);
  graph.startTask(a.id);
  graph.completeTask(a.id, 'done');
  assert.deepEqual(graph.nextReady().map((t) => t.title).sort(), ['runtime', 'scheduler']);
  assert.equal(graph.getTask(b.id)?.status, 'pending');
  assert.equal(graph.todo().length, 3);
  assert.equal(graph.todo().find((t) => t.id === c.id)?.status, 'pending');
});

test('WorkGraph rejects unknown deps and cycles', () => {
  const graph = new WorkGraph('cycle test');
  assert.throws(() => graph.addTask({ title: 'bad', dependsOn: ['missing'] }), /unknown dependency/);
  const a = graph.addTask({ title: 'a' });
  const b = graph.addTask({ title: 'b', dependsOn: [a.id] });
  const c = graph.addTask({ title: 'c', dependsOn: [b.id] });
  assert.throws(() => graph.addDependency(a.id, c.id), /dependency cycle/);
});

test('WorkGraphStore roundtrips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-wg-'));
  try {
    const graph = new WorkGraph('persist me');
    const task = graph.addTask({ title: 'one', acceptance: ['works'] });
    graph.startTask(task.id);
    graph.completeTask(task.id, 'ok');
    const store = new WorkGraphStore(dir);
    store.save(graph);
    const loaded = store.load();
    assert.equal(loaded?.goal.text, 'persist me');
    assert.equal(loaded?.allTasks().length, 1);
    assert.equal(loaded?.allTasks()[0].status, 'done');
    assert.deepEqual(loaded?.allTasks()[0].acceptance, ['works']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
