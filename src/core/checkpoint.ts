import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { newId } from './ids.ts';
import type { PlanArtifact, Evidence } from './goal.ts';
import type { TaskNode } from './workgraph.ts';

export interface Checkpoint {
  schemaVersion: 1;
  id: string;
  goalId: string;
  planId: string;
  label?: string;
  tasks: TaskNode[];
  evidence: Evidence[];
  createdAt: number;
}

export function createCheckpoint(plan: PlanArtifact, label?: string, evidence: Evidence[] = plan.evidence): Checkpoint {
  return {
    schemaVersion: 1,
    id: newId('checkpoint'),
    goalId: plan.goalId,
    planId: plan.id,
    label,
    tasks: plan.tasks.map((task) => ({ ...task, dependsOn: [...task.dependsOn], acceptance: [...task.acceptance] })),
    evidence: evidence.map((item) => ({ ...item })),
    createdAt: Date.now()
  };
}

export class CheckpointStore {
  readonly path: string;

  constructor(workspace: string) {
    this.path = join(workspace, '.weft', 'checkpoints.json');
  }

  list(): Checkpoint[] {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as { checkpoints?: Checkpoint[] };
      return Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [];
    } catch {
      return [];
    }
  }

  latest(): Checkpoint | null {
    const items = this.list();
    return items.length > 0 ? items[items.length - 1] : null;
  }

  save(checkpoint: Checkpoint): void {
    const items = this.list();
    items.push(checkpoint);
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify({ checkpoints: items }, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }

  restore(checkpointId: string): Checkpoint | null {
    return this.list().find((item) => item.id === checkpointId) ?? null;
  }
}
