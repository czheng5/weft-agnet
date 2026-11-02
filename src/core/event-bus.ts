import { newId } from './ids.ts';

export interface BusEvent<T = unknown> {
  id: string;
  type: string;
  at: number;
  data: T;
}

export type BusHandler = (event: BusEvent) => void | Promise<void>;

export class EventBus {
  private readonly handlers = new Map<string, Set<BusHandler>>();
  private readonly events: BusEvent[] = [];
  private readonly maxHistory: number;

  constructor(opts: { maxHistory?: number } = {}) {
    this.maxHistory = opts.maxHistory ?? 200;
  }

  subscribe(type: string, handler: BusHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  async publish<T>(type: string, data: T): Promise<number> {
    const event: BusEvent<T> = { id: newId('evt'), type, at: Date.now(), data };
    this.events.push(event);
    if (this.events.length > this.maxHistory) this.events.splice(0, this.events.length - this.maxHistory);
    const handlers = [...(this.handlers.get(type) ?? []), ...(this.handlers.get('*') ?? [])];
    await Promise.all(handlers.map((handler) => handler(event)));
    return handlers.length;
  }

  history(type?: string, limit = 50): BusEvent[] {
    const filtered = type ? this.events.filter((event) => event.type === type) : this.events;
    return filtered.slice(-limit).map((event) => ({ ...event }));
  }

  async replay(type: string, handler: BusHandler, limit = 50): Promise<number> {
    const events = this.history(type, limit);
    for (const event of events) await handler(event);
    return events.length;
  }

  clear(): void {
    this.events.length = 0;
  }
}
