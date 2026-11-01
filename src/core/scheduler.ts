import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type JobKind = 'wakeup' | 'interval' | 'monitor';
export type SchedulerEventType = 'scheduled' | 'fired' | 'error' | 'cancelled' | 'restored';

export interface SchedulerJob {
  id: string;
  kind: JobKind;
  handler: string;
  at?: number;
  intervalMs?: number;
  enabled: boolean;
  createdAt: number;
}

export interface SchedulerEvent {
  jobId: string;
  type: SchedulerEventType;
  detail?: unknown;
}

export interface ScheduleInput {
  id: string;
  kind: JobKind;
  handler: string;
  at?: number;
  intervalMs?: number;
}

export type JobHandler = (job: SchedulerJob) => void | Promise<void>;

export class SchedulerStore {
  readonly path: string;

  constructor(workspace: string) {
    this.path = join(workspace, '.weft', 'scheduler.json');
  }

  load(): SchedulerJob[] {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as { jobs?: SchedulerJob[] };
      return Array.isArray(parsed.jobs) ? parsed.jobs : [];
    } catch {
      return [];
    }
  }

  save(jobs: SchedulerJob[]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify({ jobs }, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}

export class Scheduler {
  private readonly jobs = new Map<string, SchedulerJob>();
  private readonly handlers = new Map<string, JobHandler>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly store?: SchedulerStore;
  private readonly onEvent?: (event: SchedulerEvent) => void;
  private running = false;

  constructor(opts: { store?: SchedulerStore; onEvent?: (event: SchedulerEvent) => void } = {}) {
    this.store = opts.store;
    this.onEvent = opts.onEvent;
  }

  registerHandler(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  schedule(input: ScheduleInput): SchedulerJob {
    if (!input.id) throw new Error('job id is empty');
    if (this.jobs.has(input.id)) throw new Error('job already exists: ' + input.id);
    if (!this.handlers.has(input.handler)) throw new Error('unknown handler: ' + input.handler);
    if (input.kind === 'wakeup' && (!input.at || input.at <= 0)) throw new Error('wakeup requires at');
    if (input.kind !== 'wakeup' && (!input.intervalMs || input.intervalMs < 1)) throw new Error('interval requires intervalMs');
    const job: SchedulerJob = {
      id: input.id,
      kind: input.kind,
      handler: input.handler,
      at: input.at,
      intervalMs: input.intervalMs,
      enabled: true,
      createdAt: Date.now()
    };
    this.jobs.set(job.id, job);
    this.onEvent?.({ jobId: job.id, type: 'scheduled' });
    this.persist();
    if (this.running) this.arm(job);
    return { ...job };
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.enabled = false;
    this.clearTimer(jobId);
    this.onEvent?.({ jobId, type: 'cancelled' });
    this.persist();
    return true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const job of this.jobs.values()) if (job.enabled) this.arm(job);
  }

  stop(): void {
    this.running = false;
    for (const id of this.timers.keys()) this.clearTimer(id);
  }

  list(): SchedulerJob[] {
    return [...this.jobs.values()].map((job) => ({ ...job }));
  }

  snapshot(): SchedulerJob[] {
    return this.list();
  }

  restore(jobs: SchedulerJob[]): void {
    this.stop();
    this.jobs.clear();
    for (const job of jobs) this.jobs.set(job.id, { ...job });
    for (const job of jobs) this.onEvent?.({ jobId: job.id, type: 'restored' });
    this.persist();
  }

  private arm(job: SchedulerJob): void {
    this.clearTimer(job.id);
    if (job.kind === 'wakeup') {
      const delay = Math.max(0, (job.at ?? 0) - Date.now());
      this.timers.set(job.id, setTimeout(() => { void this.fire(job.id); }, delay));
    } else {
      const delay = job.intervalMs ?? 1000;
      this.timers.set(job.id, setTimeout(() => { void this.fire(job.id); }, delay));
    }
  }

  private async fire(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || !job.enabled) return;
    const handler = this.handlers.get(job.handler);
    if (!handler) {
      this.onEvent?.({ jobId, type: 'error', detail: 'missing handler ' + job.handler });
      return;
    }
    try {
      await handler(job);
      this.onEvent?.({ jobId, type: 'fired' });
    } catch (error) {
      this.onEvent?.({ jobId, type: 'error', detail: error instanceof Error ? error.message : String(error) });
    }
    if (job.kind === 'wakeup') {
      job.enabled = false;
      this.clearTimer(jobId);
      this.persist();
    } else if (this.running && job.enabled) {
      this.arm(job);
    }
  }

  private clearTimer(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) clearTimeout(timer);
    this.timers.delete(jobId);
  }

  private persist(): void {
    this.store?.save(this.list());
  }
}
