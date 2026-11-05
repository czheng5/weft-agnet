import type { OutboxRecord, ThreadRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';
import type { WorkerPoolEvent } from './worker-pool.ts';
import { newId } from './ids.ts';

export interface FairWorkerPoolOptions {
  store: RuntimeStore;
  handler: (job: OutboxRecord, thread: ThreadRecord) => Promise<void>;
  workerId?: string;
  concurrency?: number;
  weights?: Record<string, number>;
  leaseTtlMs?: number;
  pollMs?: number;
  now?: () => number;
  onEvent?: (event: WorkerPoolEvent) => void;
}

interface Candidate {
  job: OutboxRecord;
  thread: ThreadRecord;
}

export class FairWorkerPool {
  readonly workerId: string;
  private readonly store: RuntimeStore;
  private readonly handler: FairWorkerPoolOptions['handler'];
  private readonly concurrency: number;
  private readonly weights: Record<string, number>;
  private readonly leaseTtlMs: number;
  private readonly pollMs: number;
  private readonly clock: () => number;
  private readonly onEvent?: (event: WorkerPoolEvent) => void;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private running = false;

  constructor(opts: FairWorkerPoolOptions) {
    this.store = opts.store;
    this.handler = opts.handler;
    this.workerId = opts.workerId ?? String(newId('fair-worker'));
    this.concurrency = Math.max(1, opts.concurrency ?? 2);
    this.weights = opts.weights ?? {};
    this.leaseTtlMs = opts.leaseTtlMs ?? 30_000;
    this.pollMs = opts.pollMs ?? 1_000;
    this.clock = opts.now ?? Date.now;
    this.onEvent = opts.onEvent;
  }

  async runOnce(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      const jobs = await this.store.claimOutbox(this.workerId, Math.max(this.concurrency * 4, 8));
      if (jobs.length === 0) return 0;
      const queues = new Map<string, Candidate[]>();
      const usedThreads = new Set<string>();
      for (const job of jobs) {
        const thread = await this.store.getThread(job.threadId);
        if (!thread) {
          await this.store.failOutbox(job.id, 'thread not found', this.clock() + this.pollMs);
          continue;
        }
        if (usedThreads.has(job.threadId)) {
          await this.store.releaseOutbox(job.id);
          continue;
        }
        usedThreads.add(job.threadId);
        const tenant = thread.scope.tenantId;
        const queue = queues.get(tenant) ?? [];
        queue.push({ job, thread });
        queues.set(tenant, queue);
      }

      const selected: Candidate[] = [];
      const tenants = [...queues.keys()].sort();
      let advanced = true;
      while (selected.length < this.concurrency && advanced) {
        advanced = false;
        for (const tenant of tenants) {
          if (selected.length >= this.concurrency) break;
          const queue = queues.get(tenant)!;
          const weight = Math.max(1, Math.floor(this.weights[tenant] ?? 1));
          for (let slot = 0; slot < weight && selected.length < this.concurrency; slot += 1) {
            const next = queue.shift();
            if (!next) break;
            selected.push(next);
            advanced = true;
          }
        }
      }
      for (const queue of queues.values()) for (const candidate of queue) await this.store.releaseOutbox(candidate.job.id);

      const results = await Promise.all(selected.map((candidate) => this.execute(candidate)));
      return results.filter(Boolean).length;
    } finally {
      this.busy = false;
    }
  }

  private async execute(candidate: Candidate): Promise<boolean> {
    const { job, thread } = candidate;
    this.onEvent?.({ type: 'claimed', jobId: job.id, threadId: thread.id });
    let lease;
    try {
      lease = await this.store.acquireLease({ threadId: thread.id, scope: thread.scope, configVersion: 'fair-' + this.workerId, model: 'default', sandbox: 'workspace-guard', ttlMs: this.leaseTtlMs });
    } catch (error) {
      await this.store.failOutbox(job.id, 'lease busy', this.clock() + this.pollMs);
      this.onEvent?.({ type: 'lease-busy', jobId: job.id, threadId: thread.id, detail: error instanceof Error ? error.message : String(error) });
      return false;
    }
    const heartbeat = setInterval(() => { void this.store.heartbeatLease(lease!.id, this.leaseTtlMs).catch(() => undefined); }, Math.max(100, Math.floor(this.leaseTtlMs / 2)));
    this.onEvent?.({ type: 'started', jobId: job.id, threadId: thread.id });
    try {
      await this.handler(job, thread);
      await this.store.completeOutbox(job.id);
      this.onEvent?.({ type: 'done', jobId: job.id, threadId: thread.id });
      return true;
    } catch (error) {
      await this.store.failOutbox(job.id, error instanceof Error ? error.message : String(error), this.clock() + this.pollMs);
      this.onEvent?.({ type: 'failed', jobId: job.id, threadId: thread.id, detail: error instanceof Error ? error.message : String(error) });
      return false;
    } finally {
      clearInterval(heartbeat);
      await this.store.releaseLease(lease.id);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => { void this.runOnce().catch((error) => this.onEvent?.({ type: 'failed', detail: error instanceof Error ? error.message : String(error) })); }, this.pollMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  isRunning(): boolean {
    return this.running;
  }
}
