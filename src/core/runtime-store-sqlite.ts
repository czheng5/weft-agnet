import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { newId } from './ids.ts';
import { assertSameScope, validateCapabilityManifest, validateMandate, validateOutbox, validateRuntimeEvent, validateThread, validateWorkerLease } from './runtime-schema.ts';
import type { CapabilityManifest, MandateRecord, OutboxRecord, RuntimeEventRecord, RuntimeScope, ThreadRecord, WorkerLeaseRecord } from './runtime-schema.ts';
import type { AcquireLeaseInput, AppendEventInput, EnqueueOutboxInput, RuntimeStore } from './runtime-store.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runtime_threads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT,
  owner TEXT,
  due_at INTEGER,
  labels_json TEXT,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runtime_threads_scope_idx ON runtime_threads (tenant_id, project_id, workspace_id, status);
CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  idempotency_key TEXT,
  UNIQUE (thread_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS runtime_events_idempotency_idx ON runtime_events (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS runtime_worker_leases (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL,
  config_version TEXT NOT NULL,
  model TEXT NOT NULL,
  sandbox TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_mandates (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_capabilities (
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  id TEXT,
  instructions TEXT,
  description TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  sandbox TEXT NOT NULL,
  evals_json TEXT NOT NULL,
  entry TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (name, version)
);
CREATE TABLE IF NOT EXISTS runtime_outbox (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  claimed_by TEXT,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runtime_outbox_pending_idx ON runtime_outbox (status, next_attempt_at);
CREATE TRIGGER IF NOT EXISTS runtime_events_no_update BEFORE UPDATE ON runtime_events
BEGIN SELECT RAISE(ABORT, 'runtime_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS runtime_events_no_delete BEFORE DELETE ON runtime_events
BEGIN SELECT RAISE(ABORT, 'runtime_events is append-only'); END;
`;

interface ThreadRow {
  id: string; tenant_id: string; project_id: string; workspace_id: string; title: string;
  status: string; priority: string | null; owner: string | null; due_at: number | null; labels_json: string | null;
  version: number; created_at: number; updated_at: number;
}
interface EventRow {
  id: string; thread_id: string; seq: number; type: string; at: number; data_json: string; idempotency_key: string | null;
}
interface LeaseRow {
  id: string; thread_id: string; tenant_id: string; project_id: string; workspace_id: string;
  status: string; config_version: string; model: string; sandbox: string;
  lease_until: number; heartbeat_at: number; created_at: number;
}
interface MandateRow {
  id: string; thread_id: string; tenant_id: string; project_id: string; workspace_id: string;
  capabilities_json: string; permissions_json: string; expires_at: number; version: number; created_at: number;
}
interface CapabilityRow {
  name: string; version: string; id: string | null; instructions: string | null; description: string; tools_json: string; permissions_json: string;
  sandbox: string; evals_json: string; entry: string | null; created_at: number;
}
interface OutboxRow {
  id: string; thread_id: string; topic: string; payload_json: string; status: string;
  attempts: number; next_attempt_at: number; claimed_by: string | null; claimed_at: number | null;
  created_at: number; updated_at: number;
}

function scopeOf(tenantId: string, projectId: string, workspaceId: string): RuntimeScope {
  return { tenantId, projectId, workspaceId };
}

function threadFromRow(row: ThreadRow): ThreadRecord {
  return validateThread({
    id: row.id,
    scope: scopeOf(row.tenant_id, row.project_id, row.workspace_id),
    title: row.title, status: row.status, priority: row.priority ?? undefined, owner: row.owner ?? undefined,
    dueAt: row.due_at ?? undefined, labels: row.labels_json ? JSON.parse(row.labels_json) : undefined,
    createdAt: row.created_at, updatedAt: row.updated_at, version: row.version
  });
}

function eventFromRow(row: EventRow): RuntimeEventRecord {
  return validateRuntimeEvent({
    id: row.id, threadId: row.thread_id, seq: row.seq, type: row.type, at: row.at,
    data: JSON.parse(row.data_json), idempotencyKey: row.idempotency_key ?? undefined
  });
}

function leaseFromRow(row: LeaseRow): WorkerLeaseRecord {
  return validateWorkerLease({
    id: row.id, threadId: row.thread_id,
    scope: scopeOf(row.tenant_id, row.project_id, row.workspace_id),
    status: row.status, configVersion: row.config_version, model: row.model, sandbox: row.sandbox,
    leaseUntil: row.lease_until, heartbeatAt: row.heartbeat_at, createdAt: row.created_at
  });
}

function mandateFromRow(row: MandateRow): MandateRecord {
  return validateMandate({
    id: row.id, threadId: row.thread_id,
    scope: scopeOf(row.tenant_id, row.project_id, row.workspace_id),
    capabilities: JSON.parse(row.capabilities_json), permissions: JSON.parse(row.permissions_json),
    expiresAt: row.expires_at, version: row.version, createdAt: row.created_at
  });
}

function capabilityFromRow(row: CapabilityRow): CapabilityManifest {
  return validateCapabilityManifest({
    name: row.name, version: row.version, id: row.id ?? undefined, instructions: row.instructions ?? undefined,
    description: row.description,
    tools: JSON.parse(row.tools_json), permissions: JSON.parse(row.permissions_json),
    sandbox: row.sandbox, evals: JSON.parse(row.evals_json), entry: row.entry ?? undefined
  });
}

function outboxFromRow(row: OutboxRow): OutboxRecord {
  return validateOutbox({
    id: row.id, threadId: row.thread_id, topic: row.topic, payload: JSON.parse(row.payload_json),
    status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at,
    claimedBy: row.claimed_by ?? undefined, claimedAt: row.claimed_at ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at
  });
}

export class SqliteRuntimeStore implements RuntimeStore {
  readonly id = 'sqlite-runtime';
  private readonly db: DatabaseSync;
  private readonly clock: () => number;

  constructor(path: string, opts: { now?: () => number } = {}) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
    this.clock = opts.now ?? Date.now;
  }

  close(): void {
    this.db.close();
  }

  async createThread(thread: ThreadRecord): Promise<ThreadRecord> {
    const record = validateThread(thread);
    this.db.prepare(
      'INSERT INTO runtime_threads (id, tenant_id, project_id, workspace_id, title, status, priority, owner, due_at, labels_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(record.id, record.scope.tenantId, record.scope.projectId, record.scope.workspaceId, record.title, record.status, record.priority ?? null, record.owner ?? null, record.dueAt ?? null, record.labels ? JSON.stringify(record.labels) : null, record.version, record.createdAt, record.updatedAt);
    return record;
  }

  async getThread(threadId: string): Promise<ThreadRecord | null> {
    const row = this.db.prepare('SELECT * FROM runtime_threads WHERE id = ?').get(threadId) as ThreadRow | undefined;
    return row ? threadFromRow(row) : null;
  }

  async updateThread(thread: ThreadRecord): Promise<ThreadRecord> {
    const record = validateThread(thread);
    const result = this.db.prepare(
      'UPDATE runtime_threads SET title = ?, status = ?, priority = ?, owner = ?, due_at = ?, labels_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?'
    ).run(record.title, record.status, record.priority ?? null, record.owner ?? null, record.dueAt ?? null, record.labels ? JSON.stringify(record.labels) : null, this.clock(), record.id, record.version);
    if (result.changes !== 1) throw new Error('thread version conflict: ' + record.id);
    const updated = await this.getThread(record.id);
    if (!updated) throw new Error('thread disappeared: ' + record.id);
    return updated;
  }

  async listThreads(scope: RuntimeScope, status?: ThreadRecord['status']): Promise<ThreadRecord[]> {
    const rows = status
      ? this.db.prepare('SELECT * FROM runtime_threads WHERE tenant_id = ? AND project_id = ? AND workspace_id = ? AND status = ? ORDER BY created_at ASC').all(scope.tenantId, scope.projectId, scope.workspaceId, status) as ThreadRow[]
      : this.db.prepare('SELECT * FROM runtime_threads WHERE tenant_id = ? AND project_id = ? AND workspace_id = ? ORDER BY created_at ASC').all(scope.tenantId, scope.projectId, scope.workspaceId) as ThreadRow[];
    return rows.map(threadFromRow);
  }

  async appendEvent(input: AppendEventInput): Promise<RuntimeEventRecord> {
    if (!input.type.trim()) throw new Error('event.type is empty');
    if (input.idempotencyKey) {
      const existing = this.db.prepare('SELECT * FROM runtime_events WHERE idempotency_key = ?').get(input.idempotencyKey) as EventRow | undefined;
      if (existing) return eventFromRow(existing);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const thread = this.db.prepare('SELECT id FROM runtime_threads WHERE id = ?').get(input.threadId) as { id: string } | undefined;
      if (!thread) throw new Error('unknown thread: ' + input.threadId);
      const last = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM runtime_events WHERE thread_id = ?').get(input.threadId) as { seq: number };
      const seq = Number(last.seq) + 1;
      if (input.expectedSeq !== undefined && input.expectedSeq !== seq) throw new Error('event sequence conflict: expected ' + input.expectedSeq + ' got ' + seq);
      const event: RuntimeEventRecord = {
        schemaVersion: 1, id: String(newId('evt')), threadId: input.threadId, seq, type: input.type, at: this.clock(), data: input.data, idempotencyKey: input.idempotencyKey
      };
      this.db.prepare('INSERT INTO runtime_events (id, thread_id, seq, type, at, data_json, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(event.id, event.threadId, event.seq, event.type, event.at, JSON.stringify(event.data), event.idempotencyKey ?? null);
      this.db.exec('COMMIT');
      return event;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async listEvents(threadId: string, afterSeq = 0, limit = 100): Promise<RuntimeEventRecord[]> {
    const rows = this.db.prepare('SELECT * FROM runtime_events WHERE thread_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?').all(threadId, afterSeq, limit) as EventRow[];
    return rows.map(eventFromRow);
  }

  async acquireLease(input: AcquireLeaseInput): Promise<WorkerLeaseRecord> {
    const now = this.clock();
    if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error('lease ttl must be positive');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const thread = this.db.prepare('SELECT tenant_id, project_id, workspace_id FROM runtime_threads WHERE id = ?').get(input.threadId) as { tenant_id: string; project_id: string; workspace_id: string } | undefined;
      if (!thread) throw new Error('unknown thread: ' + input.threadId);
      assertSameScope(input.scope, scopeOf(thread.tenant_id, thread.project_id, thread.workspace_id));
      const active = this.db.prepare("SELECT id FROM runtime_worker_leases WHERE thread_id = ? AND status = 'running' AND lease_until > ?").get(input.threadId, now) as { id: string } | undefined;
      if (active) throw new Error('thread already has an active lease: ' + active.id);
      const lease: WorkerLeaseRecord = {
        schemaVersion: 1, id: String(newId('lease')), threadId: input.threadId, scope: input.scope,
        status: 'running', configVersion: input.configVersion, model: input.model, sandbox: input.sandbox,
        leaseUntil: now + input.ttlMs, heartbeatAt: now, createdAt: now
      };
      this.db.prepare('INSERT INTO runtime_worker_leases (id, thread_id, tenant_id, project_id, workspace_id, status, config_version, model, sandbox, lease_until, heartbeat_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(lease.id, lease.threadId, lease.scope.tenantId, lease.scope.projectId, lease.scope.workspaceId, lease.status, lease.configVersion, lease.model, lease.sandbox, lease.leaseUntil, lease.heartbeatAt, lease.createdAt);
      this.db.exec('COMMIT');
      return validateWorkerLease(lease);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async heartbeatLease(leaseId: string, ttlMs: number, at = this.clock()): Promise<WorkerLeaseRecord> {
    const current = this.db.prepare('SELECT * FROM runtime_worker_leases WHERE id = ?').get(leaseId) as LeaseRow | undefined;
    if (!current) throw new Error('unknown lease: ' + leaseId);
    if (current.status !== 'running') throw new Error('lease is not running: ' + leaseId);
    this.db.prepare('UPDATE runtime_worker_leases SET heartbeat_at = ?, lease_until = ? WHERE id = ?').run(at, at + ttlMs, leaseId);
    return leaseFromRow(this.db.prepare('SELECT * FROM runtime_worker_leases WHERE id = ?').get(leaseId) as LeaseRow);
  }

  async releaseLease(leaseId: string): Promise<void> {
    this.db.prepare("UPDATE runtime_worker_leases SET status = 'stopped' WHERE id = ?").run(leaseId);
  }

  async listExpiredLeases(now = this.clock()): Promise<WorkerLeaseRecord[]> {
    const rows = this.db.prepare("SELECT * FROM runtime_worker_leases WHERE status = 'running' AND lease_until <= ? ORDER BY lease_until ASC").all(now) as LeaseRow[];
    return rows.map(leaseFromRow);
  }

  async putMandate(mandate: MandateRecord): Promise<MandateRecord> {
    const record = validateMandate(mandate);
    this.db.prepare('INSERT INTO runtime_mandates (id, thread_id, tenant_id, project_id, workspace_id, capabilities_json, permissions_json, expires_at, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(thread_id) DO UPDATE SET id=excluded.id, capabilities_json=excluded.capabilities_json, permissions_json=excluded.permissions_json, expires_at=excluded.expires_at, version=excluded.version, created_at=excluded.created_at')
      .run(record.id, record.threadId, record.scope.tenantId, record.scope.projectId, record.scope.workspaceId, JSON.stringify(record.capabilities), JSON.stringify(record.permissions), record.expiresAt, record.version, record.createdAt);
    return record;
  }

  async getMandate(threadId: string): Promise<MandateRecord | null> {
    const row = this.db.prepare('SELECT * FROM runtime_mandates WHERE thread_id = ?').get(threadId) as MandateRow | undefined;
    return row ? mandateFromRow(row) : null;
  }

  async putCapability(capability: CapabilityManifest): Promise<CapabilityManifest> {
    const record = validateCapabilityManifest(capability);
    this.db.prepare('INSERT INTO runtime_capabilities (name, version, id, instructions, description, tools_json, permissions_json, sandbox, evals_json, entry, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(name, version) DO UPDATE SET id=excluded.id, instructions=excluded.instructions, description=excluded.description, tools_json=excluded.tools_json, permissions_json=excluded.permissions_json, sandbox=excluded.sandbox, evals_json=excluded.evals_json, entry=excluded.entry')
      .run(record.name, record.version, record.id ?? null, record.instructions ?? null, record.description, JSON.stringify(record.tools), JSON.stringify(record.permissions), record.sandbox, JSON.stringify(record.evals), record.entry ?? null, this.clock());
    return record;
  }

  async getCapability(name: string, version: string): Promise<CapabilityManifest | null> {
    const row = this.db.prepare('SELECT * FROM runtime_capabilities WHERE name = ? AND version = ?').get(name, version) as CapabilityRow | undefined;
    return row ? capabilityFromRow(row) : null;
  }

  async listCapabilities(): Promise<CapabilityManifest[]> {
    const rows = this.db.prepare('SELECT * FROM runtime_capabilities ORDER BY name, version').all() as CapabilityRow[];
    return rows.map(capabilityFromRow);
  }

  async enqueueOutbox(input: EnqueueOutboxInput): Promise<OutboxRecord> {
    const now = this.clock();
    const record: OutboxRecord = {
      schemaVersion: 1, id: String(newId('outbox')), threadId: input.threadId, topic: input.topic, payload: input.payload,
      status: 'pending', attempts: 0, nextAttemptAt: input.notBefore ?? now, createdAt: now, updatedAt: now
    };
    this.db.prepare('INSERT INTO runtime_outbox (id, thread_id, topic, payload_json, status, attempts, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(record.id, record.threadId, record.topic, JSON.stringify(record.payload), record.status, record.attempts, record.nextAttemptAt, record.createdAt, record.updatedAt);
    return validateOutbox(record);
  }

  async claimOutbox(workerId: string, limit: number): Promise<OutboxRecord[]> {
    const now = this.clock();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const rows = this.db.prepare("SELECT * FROM runtime_outbox WHERE status IN ('pending', 'failed') AND next_attempt_at <= ? ORDER BY next_attempt_at ASC LIMIT ?").all(now, limit) as OutboxRow[];
      for (const row of rows) {
        this.db.prepare("UPDATE runtime_outbox SET status = 'claimed', claimed_by = ?, claimed_at = ?, updated_at = ? WHERE id = ?").run(workerId, now, now, row.id);
      }
      this.db.exec('COMMIT');
      return rows.map((row) => outboxFromRow({ ...row, status: 'claimed', claimed_by: workerId, claimed_at: now, updated_at: now }));
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async completeOutbox(id: string): Promise<void> {
    const result = this.db.prepare("UPDATE runtime_outbox SET status = 'done', updated_at = ? WHERE id = ?").run(this.clock(), id);
    if (result.changes !== 1) throw new Error('unknown outbox: ' + id);
  }

  async releaseOutbox(id: string): Promise<void> {
    this.db.prepare("UPDATE runtime_outbox SET status = 'pending', claimed_by = NULL, claimed_at = NULL, updated_at = ? WHERE id = ? AND status = 'claimed'").run(this.clock(), id);
  }

  async failOutbox(id: string, error: string, retryAt: number): Promise<void> {
    const current = this.db.prepare('SELECT attempts FROM runtime_outbox WHERE id = ?').get(id) as { attempts: number } | undefined;
    if (!current) throw new Error('unknown outbox: ' + id);
    this.db.prepare("UPDATE runtime_outbox SET status = 'failed', attempts = ?, next_attempt_at = ?, claimed_by = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?")
      .run(current.attempts + 1, retryAt, this.clock(), id);
  }
}
