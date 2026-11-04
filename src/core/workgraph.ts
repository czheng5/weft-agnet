import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { newId } from './ids.ts';

export type GoalStatus = 'active' | 'done' | 'abandoned';
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';

export interface Goal {
  id: string;
  text: string;
  status: GoalStatus;
  acceptance: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TaskNode {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  owner?: string;
  dependsOn: string[];
  acceptance: string[];
  result?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkGraphJSON {
  version: 1;
  threadId?: string;
  goal: Goal;
  tasks: TaskNode[];
}

export interface AddTaskInput {
  title: string;
  description?: string;
  owner?: string;
  dependsOn?: string[];
  acceptance?: string[];
}

export class WorkGraph {
  readonly goal: Goal;
  threadId?: string;
  private readonly tasks = new Map<string, TaskNode>();

  constructor(goalText: string, goalId = newId('goal'), threadId?: string) {
    if (!goalText.trim()) throw new Error('goal text is empty');
    const now = Date.now();
    this.goal = {
      id: goalId,
      text: goalText.trim(),
      status: 'active',
      acceptance: [],
      createdAt: now,
      updatedAt: now
    };
    this.threadId = threadId;
  }

  addTask(input: AddTaskInput): TaskNode {
    const title = input.title.trim();
    if (!title) throw new Error('task title is empty');
    const dependsOn = [...new Set(input.dependsOn ?? [])];
    for (const dep of dependsOn) {
      if (!this.tasks.has(dep)) throw new Error('unknown dependency: ' + dep);
    }
    const id = newId('task');
    if (this.wouldCycle(id, dependsOn)) throw new Error('dependency cycle');
    const now = Date.now();
    const task: TaskNode = {
      id,
      title,
      description: input.description,
      status: 'pending',
      owner: input.owner,
      dependsOn,
      acceptance: input.acceptance ?? [],
      createdAt: now,
      updatedAt: now
    };
    this.tasks.set(id, task);
    return clone(task);
  }

  addDependency(taskId: string, dependencyId: string): TaskNode {
    const task = this.require(taskId);
    if (!this.tasks.has(dependencyId)) throw new Error('unknown dependency: ' + dependencyId);
    if (task.dependsOn.includes(dependencyId)) return clone(task);
    const next = [...task.dependsOn, dependencyId];
    if (this.wouldCycle(taskId, next)) throw new Error('dependency cycle');
    task.dependsOn = next;
    task.updatedAt = Date.now();
    return clone(task);
  }

  startTask(taskId: string): TaskNode {
    const task = this.require(taskId);
    if (task.status !== 'pending') throw new Error('task is not pending: ' + task.status);
    task.status = 'in_progress';
    task.updatedAt = Date.now();
    return clone(task);
  }

  completeTask(taskId: string, result?: string): TaskNode {
    const task = this.require(taskId);
    if (task.status === 'done' || task.status === 'cancelled') throw new Error('task already closed: ' + task.status);
    task.status = 'done';
    task.result = result;
    task.updatedAt = Date.now();
    return clone(task);
  }

  failTask(taskId: string, result?: string): TaskNode {
    const task = this.require(taskId);
    task.status = 'failed';
    task.result = result;
    task.updatedAt = Date.now();
    return clone(task);
  }

  cancelTask(taskId: string): TaskNode {
    const task = this.require(taskId);
    task.status = 'cancelled';
    task.updatedAt = Date.now();
    return clone(task);
  }

  nextReady(): TaskNode[] {
    return [...this.tasks.values()]
      .filter((task) => task.status === 'pending' && task.dependsOn.every((dep) => this.tasks.get(dep)?.status === 'done'))
      .map(clone)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  todo(): Array<{ id: string; title: string; status: TaskStatus; owner?: string }> {
    return [...this.tasks.values()].map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      owner: task.owner
    }));
  }

  getTask(taskId: string): TaskNode | null {
    const task = this.tasks.get(taskId);
    return task ? clone(task) : null;
  }

  allTasks(): TaskNode[] {
    return [...this.tasks.values()].map(clone);
  }

  toJSON(): WorkGraphJSON {
    return {
      version: 1,
      threadId: this.threadId,
      goal: { ...this.goal, acceptance: [...this.goal.acceptance] },
      tasks: this.allTasks()
    };
  }

  static fromJSON(json: WorkGraphJSON): WorkGraph {
    if (json.version !== 1) throw new Error('unsupported work graph version: ' + json.version);
    const graph = new WorkGraph(json.goal.text, json.goal.id, json.threadId);
    graph.goal.status = json.goal.status;
    graph.goal.acceptance = [...json.goal.acceptance];
    graph.goal.createdAt = json.goal.createdAt;
    graph.goal.updatedAt = json.goal.updatedAt;
    for (const task of json.tasks) {
      if (!task.id || !task.title) throw new Error('invalid task');
      if (graph.tasks.has(task.id)) throw new Error('duplicate task: ' + task.id);
      graph.tasks.set(task.id, {
        ...task,
        dependsOn: [...task.dependsOn],
        acceptance: [...task.acceptance]
      });
    }
    for (const task of graph.tasks.values()) {
      for (const dep of task.dependsOn) {
        if (!graph.tasks.has(dep)) throw new Error('unknown dependency: ' + dep);
      }
      if (graph.wouldCycle(task.id, task.dependsOn)) throw new Error('dependency cycle at ' + task.id);
    }
    return graph;
  }

  private require(taskId: string): TaskNode {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('unknown task: ' + taskId);
    return task;
  }

  private wouldCycle(candidateId: string, dependencies: string[]): boolean {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (id === candidateId) return true;
      if (visited.has(id)) return false;
      if (visiting.has(id)) return false;
      visiting.add(id);
      const task = this.tasks.get(id);
      if (task) {
        for (const dep of task.dependsOn) {
          if (visit(dep)) return true;
        }
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    return dependencies.some((dep) => visit(dep));
  }
}

function clone(task: TaskNode): TaskNode {
  return { ...task, dependsOn: [...task.dependsOn], acceptance: [...task.acceptance] };
}

export class WorkGraphStore {
  readonly path: string;

  constructor(workspace: string) {
    this.path = join(workspace, '.weft', 'workgraph.json');
  }

  load(): WorkGraph | null {
    try {
      return WorkGraph.fromJSON(JSON.parse(readFileSync(this.path, 'utf8')) as WorkGraphJSON);
    } catch {
      return null;
    }
  }

  save(graph: WorkGraph): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(graph.toJSON(), null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
