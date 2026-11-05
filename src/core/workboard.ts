import type { RuntimeScope, ThreadPriority, ThreadRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface WorkItem {
  thread: ThreadRecord;
  progress: number;
  messageCount: number;
  lastEventAt: number;
  overdue: boolean;
}

export interface WorkboardSummary {
  total: number;
  byStatus: Record<string, number>;
  overdue: number;
  highPriority: number;
}

const PRIORITY_RANK: Record<ThreadPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

function progressOf(thread: ThreadRecord, hasResult: boolean): number {
  if (thread.status === 'done' || hasResult) return 100;
  if (thread.status === 'waiting') return 25;
  if (thread.status === 'working') return 50;
  return 0;
}

export class Workboard {
  private readonly store: RuntimeStore;

  constructor(store: RuntimeStore) { this.store = store; }

  async list(scope: RuntimeScope, now = Date.now()): Promise<WorkItem[]> {
    const threads = await this.store.listThreads(scope);
    const items: WorkItem[] = [];
    for (const thread of threads) {
      const events = await this.store.listEvents(thread.id, 0, 5000);
      const messageCount = events.filter((event) => event.type === 'message.user').length;
      const lastEventAt = events.length > 0 ? events[events.length - 1].at : thread.updatedAt;
      const hasResult = events.some((event) => event.type === 'agent.result');
      items.push({
        thread,
        progress: progressOf(thread, hasResult),
        messageCount,
        lastEventAt,
        overdue: Boolean(thread.dueAt && thread.dueAt < now && thread.status !== 'done')
      });
    }
    return items.sort((a, b) => {
      const pa = PRIORITY_RANK[a.thread.priority ?? 'normal'];
      const pb = PRIORITY_RANK[b.thread.priority ?? 'normal'];
      if (pa !== pb) return pa - pb;
      if (a.thread.dueAt !== undefined && b.thread.dueAt !== undefined && a.thread.dueAt !== b.thread.dueAt) return a.thread.dueAt - b.thread.dueAt;
      return b.thread.updatedAt - a.thread.updatedAt;
    });
  }

  async summary(scope: RuntimeScope, now = Date.now()): Promise<WorkboardSummary> {
    const items = await this.list(scope, now);
    const byStatus: Record<string, number> = {};
    for (const item of items) byStatus[item.thread.status] = (byStatus[item.thread.status] ?? 0) + 1;
    return {
      total: items.length,
      byStatus,
      overdue: items.filter((item) => item.overdue).length,
      highPriority: items.filter((item) => item.thread.priority === 'high' || item.thread.priority === 'critical').length
    };
  }
}
