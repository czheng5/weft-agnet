import { createHash } from 'node:crypto';
import type { ModelMessage } from './session.ts';

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RuntimeContext {
  cwd: string;
  sandbox: string;
  approvals: string;
  memory: string;
  knowledge: string;
}

export interface BuiltRequest {
  system: string;
  tools: ToolSchema[];
  messages: ModelMessage[];
  prefixHash: string;
  requestHash: string;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortValue(obj[key]);
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export function buildRequest(input: {
  system: string;
  tools: ToolSchema[];
  messages: ModelMessage[];
  instruction: string;
  runtimeContext?: string;
}): BuiltRequest {
  const tools = [...input.tools].sort((a, b) => a.name.localeCompare(b.name));
  const history = [...input.messages];
  if (input.runtimeContext && input.runtimeContext.trim().length > 0) {
    history.push({ role: 'user', content: input.runtimeContext });
  }
  const prefix = {
    system: input.system,
    tools,
    messages: history
  };
  const prefixHash = sha256(canonicalJson(prefix));
  const messages = [...history];
  if (input.instruction.trim().length > 0) {
    messages.push({ role: 'user' as const, content: input.instruction });
  }
  const requestHash = sha256(canonicalJson({ prefixHash, instruction: input.instruction, messages }));
  return deepFreeze({
    system: input.system,
    tools,
    messages,
    prefixHash,
    requestHash
  });
}

export function runtimeContextText(ctx: RuntimeContext): string {
  return [
    'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.',
    'cwd: ' + ctx.cwd,
    'sandbox: ' + ctx.sandbox,
    'approvals: ' + ctx.approvals,
    'memory: ' + ctx.memory,
    'knowledge: ' + ctx.knowledge
  ].join('\n');
}
