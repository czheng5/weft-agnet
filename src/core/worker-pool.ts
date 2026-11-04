import type { OutboxRecord, ThreadRecord, WorkerLeaseRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';
import { newId } from './ids.ts';

export interface WorkerPoolEvent {
  type: 'claimed' | 'started' | 'done' | 'failed' | 'lease-busy' | 'stopped';
  jobId?: string;
  threadId?: string;
  detail?: unknown;
}

export interface WorkerPoolOptions {
  store: RuntimeStore;
  handler: (job: OutboxRecord, thread: ThreadRecord) => Promise<void>;
  workerId?: string;
  model?: string;
  sandbox?: WorkerLeaseRecord['sandbox'];
  leaseTtlMs?: number;
  pollMs?: number;
  limit?: number;
  now?: () => number;
  onEvent?: (event: WorkerPoolEvent) => void;
}

export class WorkerPool {
  readonly workerId: string;
  private readonly store: RuntimeStore;
  private readonly handler: WorkerPoolOptions['handler'];
  private readonly model: string;
  private readonly sandbox: WorkerLeaseRecord['sandbox'];
  private readonly leaseTtlMs: number;
  private readonly pollMs: number;
  private readonly limit: number;
  private readonly clock: () => number;
  private readonly onEvent?: (event: WorkerPoolEvent) => void;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(opts: WorkerPoolOptions) {
    this.store = opts.store;
    this.handler = opts.handler;
    this.workerId = opts.workerId ?? String(newId('worker'));
    this.model = opts.model ?? 'default';
    this.sandbox = opts.sandbox ?? 'workspace-guard';
    this.leaseTtlMs = opts.leaseTtlMs ?? 30_000;
    this.pollMs = opts.pollMs ?? 1_000;
    this.limit = opts.limit ?? 1;
    this.clock = opts.now ?? Date.now;
    this.onEvent = opts.onEvent;
  }

  async runOnce(): Promise<number> {
    const jobs = await this.store.claimOutbox(this.workerId, this.limit);
    let processed = 0;
    for (const job of jobs) {
      this.onEvent?.({ type: 'claimed', jobId: job.id, threadId: job.threadId });
      const thread = await this.store.getThread(job.threadId);
      if (!thread) {
        await this.store.failOutbox(job.id, 'thread not found', this.clock() + 5_000);
        this.onEvent?.({ type: 'failed', jobId: job.id, threadId: job.threadId, detail: 'thread not found' });
        continue;
      }
      let lease;
      try {
        lease = await this.store.acquireLease({
          threadId: job.threadId,
          scope: thread.scope,
          configVersion: 'worker-' + this.workerId,
          model: this.model,
          sandbox: this.sandbox,
          ttlMs: this.leaseTtlMs
        });
      } catch (error) {
        await this.store.failOutbox(job.id, 'lease busy', this.clock() + this.pollMs);
        this.onEvent?.({ type: 'lease-busy', jobId: job.id, threadId: job.threadId, detail: error instanceof Error ? error.message : String(error) });
        continue;
      }

      const heartbeat = setInterval(() => {
        void this.store.heartbeatLease(lease!.id, this.leaseTtlMs).catch(() => undefined);
      }, Math.max(100, Math.floor(this.leaseTtlMs / 2)));
      this.onEvent?.({ type: 'started', jobId: job.id, threadId: job.threadId });
      try {
        await this.handler(job, thread);
        await this.store.completeOutbox(job.id);
        processed += 1;
        this.onEvent?.({ type: 'done', jobId: job.id, threadId: job.threadId });
      } catch (error) {
        await this.store.failOutbox(job.id, error instanceof Error ? error.message : String(error), this.clock() + this.pollMs);
        this.onEvent?.({ type: 'failed', jobId: job.id, threadId: job.threadId, detail: error instanceof Error ? error.message : String(error) });
      } finally {
        clearInterval(heartbeat);
        await this.store.releaseLease(lease.id);
      }
    }
    return processed;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error) => this.onEvent?.({ type: 'failed', detail: error instanceof Error ? error.message : String(error) }));
    }, this.pollMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.onEvent?.({ type: 'stopped' });
  }

  isRunning(): boolean {
    return this.running;
  }
}
