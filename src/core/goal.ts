import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { newId } from './ids.ts';
import type { Goal, TaskNode } from './workgraph.ts';

export interface Evidence {
  id: string;
  taskId?: string;
  criterion?: string;
  summary: string;
  passed: boolean;
  at: number;
}

export interface GoalCriterionResult {
  criterion: string;
  status: 'pass' | 'fail' | 'missing';
  evidenceIds: string[];
}

export interface GoalEvaluation {
  goalId: string;
  done: boolean;
  criteria: GoalCriterionResult[];
  missingTasks: string[];
  failedTasks: string[];
}

export class GoalEvaluator {
  evaluate(goal: Goal, tasks: TaskNode[], evidence: Evidence[]): GoalEvaluation {
    const missingTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').map((task) => task.id);
    const failedTasks = tasks.filter((task) => task.status === 'failed').map((task) => task.id);
    const criteria: GoalCriterionResult[] = goal.acceptance.map((criterion) => {
      const matches = evidence.filter((item) => item.criterion === criterion);
      if (matches.length === 0) return { criterion, status: 'missing', evidenceIds: [] };
      const passed = matches.some((item) => item.passed);
      return { criterion, status: passed ? 'pass' : 'fail', evidenceIds: matches.map((item) => item.id) };
    });
    const done = missingTasks.length === 0
      && failedTasks.length === 0
      && criteria.every((item) => item.status === 'pass');
    return { goalId: goal.id, done, criteria, missingTasks, failedTasks };
  }
}

export interface PlanArtifact {
  schemaVersion: 1;
  id: string;
  goalId: string;
  version: number;
  tasks: TaskNode[];
  evidence: Evidence[];
  createdAt: number;
  approvedAt?: number;
}

export function planFromWorkGraph(goal: Goal, tasks: TaskNode[], evidence: Evidence[] = []): PlanArtifact {
  return {
    schemaVersion: 1,
    id: newId('plan'),
    goalId: goal.id,
    version: 1,
    tasks: tasks.map((task) => ({ ...task, dependsOn: [...task.dependsOn], acceptance: [...task.acceptance] })),
    evidence: evidence.map((item) => ({ ...item })),
    createdAt: Date.now()
  };
}

export function renderPlan(plan: PlanArtifact): string {
  const lines = ['plan ' + plan.id + ' goal=' + plan.goalId + ' v' + plan.version];
  for (const task of plan.tasks) {
    lines.push('  [' + task.status + '] ' + task.id.slice(0, 8) + ' ' + task.title + (task.dependsOn.length ? ' <- ' + task.dependsOn.map((d) => d.slice(0, 8)).join(',') : ''));
  }
  return lines.join('\n');
}

export class PlanStore {
  readonly path: string;

  constructor(workspace: string) {
    this.path = join(workspace, '.weft', 'plan.json');
  }

  load(): PlanArtifact | null {
    try {
      const plan = JSON.parse(readFileSync(this.path, 'utf8')) as PlanArtifact;
      return plan.schemaVersion === 1 ? plan : null;
    } catch {
      return null;
    }
  }

  save(plan: PlanArtifact): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(plan, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
