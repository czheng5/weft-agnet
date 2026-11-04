import type { WorkerLeaseRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface WatchdogAlert {
  kind: 'expired-lease';
  at: number;
  leaseId: string;
  threadId: string;
  expiredAt: number;
}

export interface WatchdogOptions {
  store: RuntimeStore;
  intervalMs?: number;
  now?: () => number;
  onAlert?: (alert: WatchdogAlert) => void;
}

export class Watchdog {
  private readonly store: RuntimeStore;
  private readonly intervalMs: number;
  private readonly clock: () => number;
  private readonly onAlert?: (alert: WatchdogAlert) => void;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(opts: WatchdogOptions) {
    this.store = opts.store;
    this.intervalMs = opts.intervalMs ?? 5_000;
    this.clock = opts.now ?? Date.now;
    this.onAlert = opts.onAlert;
  }

  async scanOnce(): Promise<WatchdogAlert[]> {
    const now = this.clock();
    const leases: WorkerLeaseRecord[] = await this.store.listExpiredLeases(now);
    const alerts = leases.map((lease) => ({
      kind: 'expired-lease' as const,
      at: now,
      leaseId: lease.id,
      threadId: lease.threadId,
      expiredAt: lease.leaseUntil
    }));
    for (const alert of alerts) this.onAlert?.(alert);
    return alerts;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.scanOnce().catch(() => undefined);
    }, this.intervalMs);
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
