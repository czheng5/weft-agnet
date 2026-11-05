import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionEvent } from './events.ts';
import { EventLog } from './events.ts';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelMessage {
  role: Role;
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ModelToolCall[];
}

export class Session {
  readonly log: EventLog;

  constructor(root: string, sessionId?: string) {
    this.log = new EventLog({ root, sessionId });
  }

  append<T>(type: string, data: T): SessionEvent<T> {
    return this.log.append(type, data);
  }

  events(): SessionEvent[] {
    return this.log.read();
  }

  deriveMessages(): ModelMessage[] {
    const out: ModelMessage[] = [];
    for (const event of this.events()) {
      if (event.type === 'user/message') {
        const data = event.data as { content: string };
        out.push({ role: 'user', content: data.content });
      } else if (event.type === 'assistant/message') {
        const data = event.data as { content: string; toolCalls?: ModelToolCall[] };
        out.push({ role: 'assistant', content: data.content, toolCalls: data.toolCalls });
      } else if (event.type === 'tool/result') {
        const data = event.data as { callId: string; name: string; content: string };
        out.push({ role: 'tool', content: data.content, toolCallId: data.callId, toolName: data.name });
      }
    }
    return out;
  }
}

export interface SessionSummary {
  id: string;
  updatedAt: number;
  bytes: number;
}

export function listSessions(root: string): SessionSummary[] {
  const dir = join(root, '.weft', 'sessions');
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const rows: SessionSummary[] = [];
  for (const id of names) {
    try {
      const file = join(dir, id, 'events.jsonl');
      const stat = statSync(file);
      rows.push({ id, updatedAt: stat.mtimeMs, bytes: stat.size });
    } catch {
      // ignore incomplete sessions
    }
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function latestSessionId(root: string): string | undefined {
  return listSessions(root)[0]?.id;
}
