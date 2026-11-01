import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { newId, now } from './ids.ts';

export interface SessionEvent<T = unknown> {
  id: string;
  sessionId: string;
  seq: number;
  type: string;
  at: number;
  data: T;
}

export interface EventLogOptions {
  root: string;
  sessionId?: string;
}

export class EventLog {
  readonly sessionId: string;
  readonly dir: string;
  readonly file: string;
  private seq = 0;
  private lastHash: string | undefined;

  constructor(opts: EventLogOptions) {
    this.sessionId = opts.sessionId ?? newId<'SessionId'>('session');
    this.dir = join(opts.root, '.weft', 'sessions', this.sessionId);
    this.file = join(this.dir, 'events.jsonl');
    mkdirSync(this.dir, { recursive: true });
    const existing = this.read();
    const last = existing[existing.length - 1];
    this.seq = last ? last.seq + 1 : 1;
  }

  append<T>(type: string, data: T): SessionEvent<T> {
    const event: SessionEvent<T> = {
      id: newId<'EventId'>('evt'),
      sessionId: this.sessionId,
      seq: this.seq++,
      type,
      at: now(),
      data
    };
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  read(): SessionEvent[] {
    if (!existsSync(this.file)) return [];
    const text = readFileSync(this.file, 'utf8').trim();
    if (!text) return [];
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as SessionEvent);
  }

  getLastPrefixHash(): string | undefined {
    return this.lastHash;
  }

  setLastPrefixHash(hash: string): void {
    this.lastHash = hash;
  }
}
