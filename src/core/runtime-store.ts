import type {
  CapabilityManifest,
  MandateRecord,
  OutboxRecord,
  RuntimeEventRecord,
  RuntimeScope,
  ThreadRecord,
  WorkerLeaseRecord
} from './runtime-schema.ts';

export interface AppendEventInput {
  threadId: string;
  type: string;
  data: unknown;
  idempotencyKey?: string;
  expectedSeq?: number;
}

export interface AcquireLeaseInput {
  threadId: string;
  scope: RuntimeScope;
  configVersion: string;
  model: string;
  sandbox: WorkerLeaseRecord['sandbox'];
  ttlMs: number;
}

export interface EnqueueOutboxInput {
  threadId: string;
  topic: string;
  payload: unknown;
  notBefore?: number;
}

export interface RuntimeStore {
  // Threads
  createThread(thread: ThreadRecord): Promise<ThreadRecord>;
  getThread(threadId: string): Promise<ThreadRecord | null>;
  updateThread(thread: ThreadRecord): Promise<ThreadRecord>;
  listThreads(scope: RuntimeScope, status?: ThreadRecord['status']): Promise<ThreadRecord[]>;

  // Append-only event log
  appendEvent(input: AppendEventInput): Promise<RuntimeEventRecord>;
  listEvents(threadId: string, afterSeq?: number, limit?: number): Promise<RuntimeEventRecord[]>;

  // Worker leases
  acquireLease(input: AcquireLeaseInput): Promise<WorkerLeaseRecord>;
  heartbeatLease(leaseId: string, at?: number): Promise<WorkerLeaseRecord>;
  releaseLease(leaseId: string): Promise<void>;
  listExpiredLeases(now?: number): Promise<WorkerLeaseRecord[]>;

  // Mandates
  putMandate(mandate: MandateRecord): Promise<MandateRecord>;
  getMandate(threadId: string): Promise<MandateRecord | null>;

  // Capability registry
  putCapability(capability: CapabilityManifest): Promise<CapabilityManifest>;
  getCapability(name: string, version: string): Promise<CapabilityManifest | null>;
  listCapabilities(): Promise<CapabilityManifest[]>;

  // Transactional outbox
  enqueueOutbox(input: EnqueueOutboxInput): Promise<OutboxRecord>;
  claimOutbox(workerId: string, limit: number): Promise<OutboxRecord[]>;
  completeOutbox(id: string): Promise<void>;
  failOutbox(id: string, error: string, retryAt: number): Promise<void>;
}

export interface RuntimeStoreOptions {
  scope: RuntimeScope;
  now?: () => number;
}
