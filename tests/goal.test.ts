import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkGraph } from '../src/core/workgraph.ts';
import { GoalEvaluator, planFromWorkGraph, PlanStore, renderPlan } from '../src/core/goal.ts';
import type { Evidence } from '../src/core/goal.ts';

test('GoalEvaluator requires done tasks and passed evidence', () => {
  const graph = new WorkGraph('ship');
  graph.goal.acceptance = ['tests pass'];
  const task = graph.addTask({ title: 'test' });
  graph.startTask(task.id);
  graph.completeTask(task.id, 'ok');
  const evaluator = new GoalEvaluator();
  const missing = evaluator.evaluate(graph.goal, graph.allTasks(), []);
  assert.equal(missing.done, false);
  assert.equal(missing.criteria[0].status, 'missing');
  const evidence: Evidence[] = [{ id: 'ev-1', taskId: task.id, criterion: 'tests pass', summary: '42 tests', passed: true, at: Date.now() }];
  assert.equal(evaluator.evaluate(graph.goal, graph.allTasks(), evidence).done, true);
});

test('Plan artifact persists and renders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-plan-'));
  try {
    const graph = new WorkGraph('plan');
    const task = graph.addTask({ title: 'one' });
    graph.completeTask(task.id, 'done');
    const plan = planFromWorkGraph(graph.goal, graph.allTasks(), []);
    const store = new PlanStore(dir);
    store.save(plan);
    const loaded = store.load();
    assert.equal(loaded?.goalId, graph.goal.id);
    assert.equal(loaded?.tasks.length, 1);
    assert.match(renderPlan(loaded!), /one/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
