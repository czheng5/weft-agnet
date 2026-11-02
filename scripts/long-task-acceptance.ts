import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkGraph } from '../src/core/workgraph.ts';
import { GoalEvaluator, planFromWorkGraph } from '../src/core/goal.ts';
import { createCheckpoint, CheckpointStore } from '../src/core/checkpoint.ts';
import { EventBus } from '../src/core/event-bus.ts';
import type { Evidence } from '../src/core/goal.ts';

const STEPS = 50;
const CHECKPOINT_EVERY = 10;

interface StepRecord {
  index: number;
  taskId: string;
  confidence: number;
  evidenceId: string;
  checkpoint?: string;
}

async function main(): Promise<void> {
  const workspace = process.cwd();
  const graph = new WorkGraph('long-task acceptance: 50 traceable steps');
  graph.goal.acceptance = ['all 50 steps completed with evidence'];
  const bus = new EventBus();
  const steps: StepRecord[] = [];
  const createdCheckpoints: string[] = [];
  const checkpoints = new CheckpointStore(workspace);
  let previous: string | undefined;

  for (let i = 0; i < STEPS; i += 1) {
    const task = graph.addTask({
      title: 'step-' + String(i + 1).padStart(2, '0'),
      dependsOn: previous ? [previous] : [],
      acceptance: ['evidence recorded']
    });
    graph.startTask(task.id);
    const confidence = Number((0.9 + (i % 10) * 0.01).toFixed(2));
    graph.completeTask(task.id, 'confidence=' + confidence);
    const evidence: Evidence = {
      id: 'ev-' + String(i + 1).padStart(3, '0'),
      taskId: task.id,
      criterion: 'all 50 steps completed with evidence',
      summary: 'step ' + (i + 1) + ' completed',
      passed: true,
      at: Date.now()
    };
    await bus.publish('task.step', { index: i + 1, taskId: task.id, confidence });
    steps.push({ index: i + 1, taskId: task.id, confidence, evidenceId: evidence.id });

    if ((i + 1) % CHECKPOINT_EVERY === 0) {
      const plan = planFromWorkGraph(graph.goal, graph.allTasks(), [evidence]);
      const checkpoint = createCheckpoint(plan, 'after-step-' + (i + 1));
      checkpoints.save(checkpoint);
      createdCheckpoints.push(checkpoint.id);
      steps[steps.length - 1].checkpoint = checkpoint.id;
    }
    previous = task.id;
  }

  const finalEvidence: Evidence[] = steps.map((step) => ({
    id: step.evidenceId,
    taskId: step.taskId,
    criterion: 'all 50 steps completed with evidence',
    summary: 'step ' + step.index,
    passed: true,
    at: Date.now()
  }));
  const evaluation = new GoalEvaluator().evaluate(graph.goal, graph.allTasks(), finalEvidence);
  const replayed = await bus.replay('task.step', async () => {});
  const latest = createdCheckpoints.length > 0 ? checkpoints.restore(createdCheckpoints[createdCheckpoints.length - 1]) : null;
  const resumeCount = latest?.tasks.length ?? 0;
  const minConfidence = Math.min(...steps.map((step) => step.confidence));
  const avgConfidence = steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length;
  const report = {
    generatedAt: new Date().toISOString(),
    steps: STEPS,
    checkpoints: createdCheckpoints.length,
    evidence: finalEvidence.length,
    replayed,
    resumeTasks: resumeCount,
    minConfidence,
    avgConfidence: Number(avgConfidence.toFixed(3)),
    goalDone: evaluation.done,
    records: steps
  };
  const dir = join(workspace, '.weft', 'acceptance');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'long-task.json');
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');

  const pass = evaluation.done
    && graph.allTasks().length === STEPS
    && createdCheckpoints.length === STEPS / CHECKPOINT_EVERY
    && finalEvidence.length === STEPS
    && replayed === STEPS
    && resumeCount > 0;
  console.log('LONG TASK ACCEPTANCE ' + (pass ? 'PASS' : 'FAIL'));
  console.log('  steps=' + STEPS + ' checkpoints=' + report.checkpoints + ' evidence=' + report.evidence + ' replay=' + replayed);
  console.log('  goalDone=' + evaluation.done + ' resumeTasks=' + resumeCount + ' minConfidence=' + minConfidence + ' avgConfidence=' + report.avgConfidence);
  console.log('  report=' + path);
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error('LONG TASK ACCEPTANCE FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
