import { newId } from './ids.ts';

export type ActorStatus = 'idle' | 'running' | 'done' | 'failed' | 'stopped';

export interface ActorHandle {
  id: string;
  name: string;
  parentId?: string;
  status: ActorStatus;
  createdAt: number;
}

export interface ActorContext {
  id: string;
  name: string;
  signal: AbortSignal;
  mailbox: unknown[];
}

export interface SpawnActorInput<T> {
  name: string;
  parentId?: string;
  run: (context: ActorContext) => Promise<T>;
}

export interface ActorEvent {
  actorId: string;
  type: 'spawned' | 'started' | 'message' | 'done' | 'failed' | 'stopped';
  detail?: unknown;
}

interface ActorRecord<T = unknown> extends ActorHandle {
  controller: AbortController;
  mailbox: unknown[];
  result?: T;
  error?: unknown;
  promise: Promise<T>;
}

export class ActorRuntime {
  private readonly actors = new Map<string, ActorRecord>();
  private readonly onEvent?: (event: ActorEvent) => void;

  constructor(opts: { onEvent?: (event: ActorEvent) => void } = {}) {
    this.onEvent = opts.onEvent;
  }

  spawn<T>(input: SpawnActorInput<T>): ActorHandle {
    if (!input.name.trim()) throw new Error('actor name is empty');
    if (input.parentId && !this.actors.has(input.parentId)) throw new Error('unknown parent actor: ' + input.parentId);
    const id = newId('actor');
    const controller = new AbortController();
    const record: ActorRecord<T> = {
      id,
      name: input.name,
      parentId: input.parentId,
      status: 'running',
      createdAt: Date.now(),
      controller,
      mailbox: [],
      promise: Promise.resolve(undefined as T)
    };
    this.actors.set(id, record as ActorRecord);
    this.onEvent?.({ actorId: id, type: 'spawned' });

    record.promise = (async () => {
      this.onEvent?.({ actorId: id, type: 'started' });
      try {
        const result = await input.run({
          id,
          name: input.name,
          signal: controller.signal,
          mailbox: record.mailbox
        });
        if (controller.signal.aborted) {
          record.status = 'stopped';
          this.onEvent?.({ actorId: id, type: 'stopped' });
        } else {
          record.status = 'done';
          record.result = result;
          this.onEvent?.({ actorId: id, type: 'done', detail: result });
        }
        return result;
      } catch (error) {
        if (controller.signal.aborted) {
          record.status = 'stopped';
          this.onEvent?.({ actorId: id, type: 'stopped' });
        } else {
          record.status = 'failed';
          record.error = error;
          this.onEvent?.({ actorId: id, type: 'failed', detail: error });
        }
        throw error;
      }
    })();

    return this.handle(record);
  }

  send(actorId: string, message: unknown): void {
    const actor = this.require(actorId);
    actor.mailbox.push(message);
    this.onEvent?.({ actorId, type: 'message', detail: message });
  }

  mailbox(actorId: string): unknown[] {
    return [...this.require(actorId).mailbox];
  }

  stop(actorId: string): void {
    const actor = this.require(actorId);
    if (actor.status === 'done' || actor.status === 'failed' || actor.status === 'stopped') return;
    actor.controller.abort();
    actor.status = 'stopped';
    this.onEvent?.({ actorId, type: 'stopped' });
  }

  async wait<T = unknown>(actorId: string): Promise<T> {
    const actor = this.require(actorId);
    return actor.promise as Promise<T>;
  }

  get(actorId: string): ActorHandle | null {
    const actor = this.actors.get(actorId);
    return actor ? this.handle(actor) : null;
  }

  list(): ActorHandle[] {
    return [...this.actors.values()].map((actor) => this.handle(actor));
  }

  children(parentId: string): ActorHandle[] {
    return [...this.actors.values()].filter((actor) => actor.parentId === parentId).map((actor) => this.handle(actor));
  }

  private handle(actor: ActorRecord): ActorHandle {
    return {
      id: actor.id,
      name: actor.name,
      parentId: actor.parentId,
      status: actor.status,
      createdAt: actor.createdAt
    };
  }

  private require(actorId: string): ActorRecord {
    const actor = this.actors.get(actorId);
    if (!actor) throw new Error('unknown actor: ' + actorId);
    return actor;
  }
}
