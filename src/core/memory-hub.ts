import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { newId } from './ids.ts';
import type {
  ForgetReceipt,
  ForgetSelector,
  MemoryHit,
  MemoryProvider,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  ProviderHealth,
  WriteReceipt
} from './memory.ts';

export interface MemoryRelation {
  from: string;
  to: string;
  type: string;
  weight: number;
  createdAt: number;
}

export interface OutboxEvent {
  id: string;
  type: 'memory.written' | 'memory.forgotten';
  memoryId: string;
  version: number;
  status: 'pending' | 'done';
  createdAt: number;
}

export class RelationStore {
  readonly path?: string;
  private readonly relations: MemoryRelation[] = [];

  constructor(workspace?: string) {
    if (workspace) this.path = join(workspace, '.weft', 'relations.json');
    this.load();
  }

  add(relation: Omit<MemoryRelation, 'createdAt'>): MemoryRelation {
    const next: MemoryRelation = { ...relation, createdAt: Date.now() };
    this.relations.push(next);
    this.persist();
    return next;
  }

  neighbors(memoryId: string): MemoryRelation[] {
    return this.relations.filter((relation) => relation.from === memoryId || relation.to === memoryId);
  }

  all(): MemoryRelation[] {
    return this.relations.map((relation) => ({ ...relation }));
  }

  private load(): void {
    if (!this.path) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as { relations?: MemoryRelation[] };
      if (Array.isArray(parsed.relations)) this.relations.push(...parsed.relations);
    } catch {
      // absent store
    }
  }

  private persist(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify({ relations: this.relations }, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}

export class Outbox {
  private readonly events: OutboxEvent[] = [];

  enqueue(event: Omit<OutboxEvent, 'id' | 'status' | 'createdAt'>): OutboxEvent {
    const next: OutboxEvent = { ...event, id: newId('outbox'), status: 'pending', createdAt: Date.now() };
    this.events.push(next);
    return next;
  }

  pending(): OutboxEvent[] {
    return this.events.filter((event) => event.status === 'pending').map((event) => ({ ...event }));
  }

  all(): OutboxEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  async drain(handler: (event: OutboxEvent) => Promise<void> | void): Promise<number> {
    let count = 0;
    for (const event of this.events) {
      if (event.status !== 'pending') continue;
      await handler({ ...event });
      event.status = 'done';
      count += 1;
    }
    return count;
  }
}

export class MemoryHub implements MemoryProvider {
  readonly id: string;
  readonly provider: MemoryProvider;
  readonly relations: RelationStore;
  readonly outbox = new Outbox();

  constructor(opts: { provider: MemoryProvider; workspace?: string }) {
    this.provider = opts.provider;
    this.relations = new RelationStore(opts.workspace);
    this.id = 'memoryhub+' + opts.provider.id;
  }

  async write(records: MemoryRecord[], relations: MemoryRelation[] = []): Promise<WriteReceipt[]> {
    const receipts = await this.provider.write(records);
    for (const receipt of receipts) {
      if (receipt.status === 'committed') this.outbox.enqueue({ type: 'memory.written', memoryId: receipt.id, version: receipt.version });
    }
    for (const relation of relations) this.relations.add(relation);
    return receipts;
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const base = await this.provider.search(query);
    const seen = new Set(base.map((hit) => hit.record.id));
    const expanded: MemoryHit[] = [...base];
    for (const hit of base) {
      for (const relation of this.relations.neighbors(hit.record.id)) {
        const neighborId = relation.from === hit.record.id ? relation.to : relation.from;
        if (seen.has(neighborId)) continue;
        const record = await this.provider.get(neighborId, query.scope);
        if (!record || record.status !== 'active') continue;
        seen.add(neighborId);
        expanded.push({
          record,
          score: Math.max(0, hit.score * relation.weight * 0.8),
          matchedBy: ['graph']
        });
      }
    }
    expanded.sort((a, b) => b.score - a.score);
    return expanded.slice(0, query.topK ?? 5);
  }

  async get(id: string, scope: MemoryScope): Promise<MemoryRecord | null> {
    return this.provider.get(id, scope);
  }

  async forget(selector: ForgetSelector): Promise<ForgetReceipt> {
    const receipt = await this.provider.forget(selector);
    for (const id of selector.ids ?? []) {
      this.outbox.enqueue({ type: 'memory.forgotten', memoryId: id, version: 1 });
    }
    return receipt;
  }

  async health(): Promise<ProviderHealth> {
    return this.provider.health();
  }

  async close(): Promise<void> {
    const closeable = this.provider as MemoryProvider & { close?: () => void | Promise<void> };
    await closeable.close?.();
  }
}
