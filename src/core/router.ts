import type { OutboxRecord, RuntimeEventRecord, ThreadRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface AdmissionDecision {
  accept: boolean;
  reason: string;
}

export type AdmissionPolicy = (thread: ThreadRecord, text: string) => Promise<AdmissionDecision> | AdmissionDecision;

export interface RouterOptions {
  store: RuntimeStore;
  admission?: AdmissionPolicy;
  now?: () => number;
}

export interface RouteResult {
  accepted: boolean;
  reason: string;
  event?: RuntimeEventRecord;
  job?: OutboxRecord;
}

export class Router {
  readonly store: RuntimeStore;
  private readonly admission: AdmissionPolicy;
  private readonly clock: () => number;

  constructor(opts: RouterOptions) {
    this.store = opts.store;
    this.admission = opts.admission ?? (() => ({ accept: true, reason: 'default accept' }));
    this.clock = opts.now ?? Date.now;
  }

  async route(thread: ThreadRecord, text: string, opts: { idempotencyKey?: string; capability?: string } = {}): Promise<RouteResult> {
    const content = text.trim();
    if (!content) return { accepted: false, reason: 'empty message' };
    const decision = await this.admission(thread, content);
    if (!decision.accept) return { accepted: false, reason: decision.reason };

    if (opts.capability) {
      const mandate = await this.store.getMandate(thread.id);
      if (mandate) {
        if (mandate.expiresAt <= this.clock()) return { accepted: false, reason: 'mandate expired' };
        if (!mandate.capabilities.includes(opts.capability)) return { accepted: false, reason: 'mandate does not allow ' + opts.capability };
      }
    }

    const event = await this.store.appendEvent({
      threadId: thread.id,
      type: 'message.user',
      data: { text: content },
      idempotencyKey: opts.idempotencyKey
    });
    const job = opts.idempotencyKey ? undefined : await this.store.enqueueOutbox({ threadId: thread.id, topic: 'worker.task', payload: { eventId: event.id } });
    return { accepted: true, reason: decision.reason, event, job };
  }
}
