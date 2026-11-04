import { newId } from './ids.ts';
import type { RuntimeScope } from './runtime-schema.ts';

export const WEFT_PROTOCOL = 'weft/1';

export type EnvelopeType = 'thread.create' | 'thread.message' | 'thread.event' | 'agent.result' | 'capability.install';

export interface WeftEnvelope {
  protocol: typeof WEFT_PROTOCOL;
  id: string;
  type: EnvelopeType;
  scope: RuntimeScope;
  threadId?: string;
  sentAt: number;
  payload: unknown;
  idempotencyKey?: string;
}

export class ProtocolError extends Error {
  constructor(message: string) {
    super('weft protocol: ' + message);
    this.name = 'ProtocolError';
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ProtocolError(field + ' must be non-empty');
  return value;
}

export function validateEnvelope(value: unknown): WeftEnvelope {
  if (!value || typeof value !== 'object') throw new ProtocolError('envelope must be an object');
  const input = value as Record<string, unknown>;
  if (input.protocol !== WEFT_PROTOCOL) throw new ProtocolError('unsupported protocol');
  const types: EnvelopeType[] = ['thread.create', 'thread.message', 'thread.event', 'agent.result', 'capability.install'];
  if (!types.includes(input.type as EnvelopeType)) throw new ProtocolError('unknown type');
  const scope = input.scope as Record<string, unknown> | undefined;
  if (!scope) throw new ProtocolError('scope is required');
  const threadId = input.threadId;
  if (threadId !== undefined) requireString(threadId, 'threadId');
  if (input.type !== 'thread.create' && input.type !== 'capability.install' && threadId === undefined) throw new ProtocolError('threadId is required for ' + input.type);
  if (typeof input.sentAt !== 'number' || !Number.isFinite(input.sentAt)) throw new ProtocolError('sentAt must be a finite number');
  return {
    protocol: WEFT_PROTOCOL,
    id: requireString(input.id, 'id'),
    type: input.type as EnvelopeType,
    scope: {
      tenantId: requireString(scope.tenantId, 'scope.tenantId'),
      projectId: requireString(scope.projectId, 'scope.projectId'),
      workspaceId: requireString(scope.workspaceId, 'scope.workspaceId')
    },
    threadId: threadId as string | undefined,
    sentAt: input.sentAt,
    payload: input.payload,
    idempotencyKey: typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined
  };
}

export function createEnvelope(input: Omit<WeftEnvelope, 'protocol' | 'id' | 'sentAt'> & { id?: string; sentAt?: number }): WeftEnvelope {
  return validateEnvelope({
    ...input,
    protocol: WEFT_PROTOCOL,
    id: input.id ?? String(newId('env')),
    sentAt: input.sentAt ?? Date.now()
  });
}
