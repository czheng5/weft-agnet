import { newId } from './ids.ts';

export const RUNTIME_SCHEMA_VERSION = 1;

export interface RuntimeScope {
  tenantId: string;
  projectId: string;
  workspaceId: string;
}

export type ThreadStatus = 'open' | 'working' | 'waiting' | 'done' | 'failed' | 'stopped';
export type WorkerStatus = 'pending' | 'running' | 'idle' | 'stopped' | 'failed';
export type SandboxKind = 'workspace-guard' | 'bwrap' | 'docker' | 'wsl';

export interface PermissionSet {
  read: string[];
  write: string[];
  exec: string[];
  network: string[];
}

export interface ThreadRecord {
  schemaVersion: number;
  id: string;
  scope: RuntimeScope;
  title: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface WorkerLeaseRecord {
  schemaVersion: number;
  id: string;
  threadId: string;
  scope: RuntimeScope;
  status: WorkerStatus;
  configVersion: string;
  model: string;
  sandbox: SandboxKind;
  leaseUntil: number;
  heartbeatAt: number;
  createdAt: number;
}

export interface RuntimeEventRecord {
  schemaVersion: number;
  id: string;
  threadId: string;
  seq: number;
  type: string;
  at: number;
  data: unknown;
  idempotencyKey?: string;
}

export interface MandateRecord {
  schemaVersion: number;
  id: string;
  threadId: string;
  scope: RuntimeScope;
  capabilities: string[];
  permissions: PermissionSet;
  createdAt: number;
  expiresAt: number;
  version: number;
}

export interface CapabilityManifest {
  schemaVersion: number;
  name: string;
  version: string;
  description: string;
  tools: string[];
  permissions: PermissionSet;
  sandbox: SandboxKind | 'any';
  evals: string[];
  entry?: string;
}

export type OutboxStatus = 'pending' | 'claimed' | 'done' | 'failed';

export interface OutboxRecord {
  schemaVersion: number;
  id: string;
  threadId: string;
  topic: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  claimedBy?: string;
  claimedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type RuntimeRecord =
  | ThreadRecord
  | WorkerLeaseRecord
  | RuntimeEventRecord
  | MandateRecord
  | CapabilityManifest
  | OutboxRecord;

export class RuntimeSchemaError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super('runtime schema ' + field + ': ' + message);
    this.name = 'RuntimeSchemaError';
    this.field = field;
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RuntimeSchemaError(field, 'must be a non-empty string');
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RuntimeSchemaError(field, 'must be a finite number');
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new RuntimeSchemaError(field, 'must be an array of non-empty strings');
  }
  return [...value];
}

function requirePermissionSet(value: unknown, field: string): PermissionSet {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError(field, 'must be an object');
  const input = value as Record<string, unknown>;
  return {
    read: requireStringArray(input.read ?? [], field + '.read'),
    write: requireStringArray(input.write ?? [], field + '.write'),
    exec: requireStringArray(input.exec ?? [], field + '.exec'),
    network: requireStringArray(input.network ?? [], field + '.network')
  };
}

export function validateScope(value: unknown, field = 'scope'): RuntimeScope {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError(field, 'must be an object');
  const input = value as Record<string, unknown>;
  return {
    tenantId: requireString(input.tenantId, field + '.tenantId'),
    projectId: requireString(input.projectId, field + '.projectId'),
    workspaceId: requireString(input.workspaceId, field + '.workspaceId')
  };
}

export function assertSameScope(a: RuntimeScope, b: RuntimeScope): void {
  if (a.tenantId !== b.tenantId || a.projectId !== b.projectId || a.workspaceId !== b.workspaceId) {
    throw new RuntimeSchemaError('scope', 'records cross tenant/project/workspace boundary');
  }
}

export function validateThread(value: unknown): ThreadRecord {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError('thread', 'must be an object');
  const input = value as Record<string, unknown>;
  const status = input.status;
  if (status !== 'open' && status !== 'working' && status !== 'waiting' && status !== 'done' && status !== 'failed' && status !== 'stopped') {
    throw new RuntimeSchemaError('thread.status', 'unknown status');
  }
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: requireString(input.id, 'thread.id'),
    scope: validateScope(input.scope, 'thread.scope'),
    title: requireString(input.title, 'thread.title'),
    status,
    createdAt: requireNumber(input.createdAt, 'thread.createdAt'),
    updatedAt: requireNumber(input.updatedAt, 'thread.updatedAt'),
    version: requireNumber(input.version, 'thread.version')
  };
}

export function validateWorkerLease(value: unknown): WorkerLeaseRecord {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError('worker', 'must be an object');
  const input = value as Record<string, unknown>;
  const status = input.status;
  if (status !== 'pending' && status !== 'running' && status !== 'idle' && status !== 'stopped' && status !== 'failed') {
    throw new RuntimeSchemaError('worker.status', 'unknown status');
  }
  const sandbox = input.sandbox;
  if (sandbox !== 'workspace-guard' && sandbox !== 'bwrap' && sandbox !== 'docker' && sandbox !== 'wsl') {
    throw new RuntimeSchemaError('worker.sandbox', 'unknown sandbox');
  }
  const leaseUntil = requireNumber(input.leaseUntil, 'worker.leaseUntil');
  const heartbeatAt = requireNumber(input.heartbeatAt, 'worker.heartbeatAt');
  if (leaseUntil < heartbeatAt) throw new RuntimeSchemaError('worker.leaseUntil', 'lease expired before heartbeat');
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: requireString(input.id, 'worker.id'),
    threadId: requireString(input.threadId, 'worker.threadId'),
    scope: validateScope(input.scope, 'worker.scope'),
    status,
    configVersion: requireString(input.configVersion, 'worker.configVersion'),
    model: requireString(input.model, 'worker.model'),
    sandbox,
    leaseUntil,
    heartbeatAt,
    createdAt: requireNumber(input.createdAt, 'worker.createdAt')
  };
}

export function validateRuntimeEvent(value: unknown): RuntimeEventRecord {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError('event', 'must be an object');
  const input = value as Record<string, unknown>;
  const seq = requireNumber(input.seq, 'event.seq');
  if (!Number.isInteger(seq) || seq < 1) throw new RuntimeSchemaError('event.seq', 'must be a positive integer');
  const idempotencyKey = input.idempotencyKey;
  if (idempotencyKey !== undefined) requireString(idempotencyKey, 'event.idempotencyKey');
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: requireString(input.id, 'event.id'),
    threadId: requireString(input.threadId, 'event.threadId'),
    seq,
    type: requireString(input.type, 'event.type'),
    at: requireNumber(input.at, 'event.at'),
    data: input.data,
    idempotencyKey: idempotencyKey as string | undefined
  };
}

export function validateMandate(value: unknown): MandateRecord {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError('mandate', 'must be an object');
  const input = value as Record<string, unknown>;
  const expiresAt = requireNumber(input.expiresAt, 'mandate.expiresAt');
  const createdAt = requireNumber(input.createdAt, 'mandate.createdAt');
  if (expiresAt <= createdAt) throw new RuntimeSchemaError('mandate.expiresAt', 'must be after createdAt');
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: requireString(input.id, 'mandate.id'),
    threadId: requireString(input.threadId, 'mandate.threadId'),
    scope: validateScope(input.scope, 'mandate.scope'),
    capabilities: requireStringArray(input.capabilities, 'mandate.capabilities'),
    permissions: requirePermissionSet(input.permissions, 'mandate.permissions'),
    createdAt,
    expiresAt,
    version: requireNumber(input.version, 'mandate.version')
  };
}

export function validateCapabilityManifest(value: unknown): CapabilityManifest {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError('capability', 'must be an object');
  const input = value as Record<string, unknown>;
  const sandbox = input.sandbox;
  if (sandbox !== 'workspace-guard' && sandbox !== 'bwrap' && sandbox !== 'docker' && sandbox !== 'wsl' && sandbox !== 'any') {
    throw new RuntimeSchemaError('capability.sandbox', 'unknown sandbox');
  }
  const entry = input.entry;
  if (entry !== undefined) requireString(entry, 'capability.entry');
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    name: requireString(input.name, 'capability.name'),
    version: requireString(input.version, 'capability.version'),
    description: requireString(input.description, 'capability.description'),
    tools: requireStringArray(input.tools, 'capability.tools'),
    permissions: requirePermissionSet(input.permissions, 'capability.permissions'),
    sandbox,
    evals: requireStringArray(input.evals, 'capability.evals'),
    entry: entry as string | undefined
  };
}

export function validateOutbox(value: unknown): OutboxRecord {
  if (!value || typeof value !== 'object') throw new RuntimeSchemaError('outbox', 'must be an object');
  const input = value as Record<string, unknown>;
  const status = input.status;
  if (status !== 'pending' && status !== 'claimed' && status !== 'done' && status !== 'failed') {
    throw new RuntimeSchemaError('outbox.status', 'unknown status');
  }
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: requireString(input.id, 'outbox.id'),
    threadId: requireString(input.threadId, 'outbox.threadId'),
    topic: requireString(input.topic, 'outbox.topic'),
    payload: input.payload,
    status,
    attempts: requireNumber(input.attempts, 'outbox.attempts'),
    nextAttemptAt: requireNumber(input.nextAttemptAt, 'outbox.nextAttemptAt'),
    claimedBy: input.claimedBy as string | undefined,
    claimedAt: input.claimedAt as number | undefined,
    createdAt: requireNumber(input.createdAt, 'outbox.createdAt'),
    updatedAt: requireNumber(input.updatedAt, 'outbox.updatedAt')
  };
}

export function createThreadRecord(input: Omit<ThreadRecord, 'schemaVersion' | 'id' | 'createdAt' | 'updatedAt' | 'version'> & { id?: string; now?: number }): ThreadRecord {
  const at = input.now ?? Date.now();
  const record: ThreadRecord = {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    id: input.id ?? String(newId('thread')),
    scope: validateScope(input.scope),
    title: input.title,
    status: input.status,
    createdAt: at,
    updatedAt: at,
    version: 1
  };
  return validateThread(record);
}
