import { newId } from './ids.ts';
import { assertSameScope, validateCapabilityManifest, validateMandate, validateOutbox, validateRuntimeEvent, validateThread, validateWorkerLease } from './runtime-schema.ts';
import type { CapabilityManifest, MandateRecord, OutboxRecord, RuntimeEventRecord, RuntimeScope, ThreadRecord, WorkerLeaseRecord } from './runtime-schema.ts';
import type { AcquireLeaseInput, AppendEventInput, EnqueueOutboxInput, RuntimeStore } from './runtime-store.ts';
import type { PgClientLike, PgPoolLike } from './memory-postgres.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runtime_threads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS runtime_threads_scope_idx ON runtime_threads (tenant_id, project_id, workspace_id, status);
CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  at BIGINT NOT NULL,
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
  lease_until BIGINT NOT NULL,
  heartbeat_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_mandates (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  version INTEGER NOT NULL,
  created_at BIGINT NOT NULL
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
  created_at BIGINT NOT NULL,
  PRIMARY KEY (name, version)
);
CREATE TABLE IF NOT EXISTS runtime_outbox (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL,
  claimed_by TEXT,
  claimed_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS runtime_outbox_pending_idx ON runtime_outbox (status, next_attempt_at);
`;

interface ThreadRow {
  id: string; tenant_id: string; project_id: string; workspace_id: string; title: string;
  status: string; version: number; created_at: string | number; updated_at: string | number;
}
interface EventRow { id: string; thread_id: string; seq: number; type: string; at: string | number; data_json: string; idempotency_key: string | null; }
interface LeaseRow {
  id: string; thread_id: string; tenant_id: string; project_id: string; workspace_id: string;
  status: string; config_version: string; model: string; sandbox: string;
  lease_until: string | number; heartbeat_at: string | number; created_at: string | number;
}
interface MandateRow {
  id: string; thread_id: string; tenant_id: string; project_id: string; workspace_id: string;
  capabilities_json: string; permissions_json: string; expires_at: string | number; version: number; created_at: string | number;
}
interface CapabilityRow { name: string; version: string; id: string | null; instructions: string | null; description: string; tools_json: string; permissions_json: string; sandbox: string; evals_json: string; entry: string | null; }
interface OutboxRow {
  id: string; thread_id: string; topic: string; payload_json: string; status: string;
  attempts: number; next_attempt_at: string | number; claimed_by: string | null; claimed_at: string | number | null;
  created_at: string | number; updated_at: string | number;
}

function scopeOf(tenantId: string, projectId: string, workspaceId: string): RuntimeScope {
  return { tenantId, projectId, workspaceId };
}

function threadFromRow(row: ThreadRow): ThreadRecord {
  return validateThread({ id: row.id, scope: scopeOf(row.tenant_id, row.project_id, row.workspace_id), title: row.title, status: row.status, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), version: Number(row.version) });
}
function eventFromRow(row: EventRow): RuntimeEventRecord {
  return validateRuntimeEvent({ id: row.id, threadId: row.thread_id, seq: Number(row.seq), type: row.type, at: Number(row.at), data: JSON.parse(row.data_json), idempotencyKey: row.idempotency_key ?? undefined });
}
function leaseFromRow(row: LeaseRow): WorkerLeaseRecord {
  return validateWorkerLease({ id: row.id, threadId: row.thread_id, scope: scopeOf(row.tenant_id, row.project_id, row.workspace_id), status: row.status, configVersion: row.config_version, model: row.model, sandbox: row.sandbox, leaseUntil: Number(row.lease_until), heartbeatAt: Number(row.heartbeat_at), createdAt: Number(row.created_at) });
}
function mandateFromRow(row: MandateRow): MandateRecord {
  return validateMandate({ id: row.id, threadId: row.thread_id, scope: scopeOf(row.tenant_id, row.project_id, row.workspace_id), capabilities: JSON.parse(row.capabilities_json), permissions: JSON.parse(row.permissions_json), expiresAt: Number(row.expires_at), version: Number(row.version), createdAt: Number(row.created_at) });
}
function capabilityFromRow(row: CapabilityRow): CapabilityManifest {
  return validateCapabilityManifest({ name: row.name, version: row.version, id: row.id ?? undefined, instructions: row.instructions ?? undefined, description: row.description, tools: JSON.parse(row.tools_json), permissions: JSON.parse(row.permissions_json), sandbox: row.sandbox, evals: JSON.parse(row.evals_json), entry: row.entry ?? undefined });
}
function outboxFromRow(row: OutboxRow): OutboxRecord {
  return validateOutbox({ id: row.id, threadId: row.thread_id, topic: row.topic, payload: JSON.parse(row.payload_json), status: row.status, attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), claimedBy: row.claimed_by ?? undefined, claimedAt: row.claimed_at === null ? undefined : Number(row.claimed_at), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) });
}

export class PostgresRuntimeStore implements RuntimeStore {
  readonly id = 'postgres-runtime';
  readonly pool: PgPoolLike;
  private readonly clock: () => number;
  private initialized = false;

  constructor(opts: { pool: PgPoolLike; now?: () => number }) {
    this.pool = opts.pool;
    this.clock = opts.now ?? Date.now;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.pool.query(SCHEMA);
    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async tx<T>(fn: (client: PgClientLike) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release?.();
    }
  }

  async createThread(thread: ThreadRecord): Promise<ThreadRecord> {
    const record = validateThread(thread);
    await this.pool.query('INSERT INTO runtime_threads (id, tenant_id, project_id, workspace_id, title, status, version, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [record.id, record.scope.tenantId, record.scope.projectId, record.scope.workspaceId, record.title, record.status, record.version, record.createdAt, record.updatedAt]);
    return record;
  }

  async getThread(threadId: string): Promise<ThreadRecord | null> {
    const result = await this.pool.query('SELECT * FROM runtime_threads WHERE id = $1', [threadId]);
    const row = result.rows[0] as ThreadRow | undefined;
    return row ? threadFromRow(row) : null;
  }

  async updateThread(thread: ThreadRecord): Promise<ThreadRecord> {
    const record = validateThread(thread);
    const result = await this.pool.query('UPDATE runtime_threads SET title=$1, status=$2, version=version+1, updated_at=$3 WHERE id=$4 AND version=$5 RETURNING *', [record.title, record.status, this.clock(), record.id, record.version]);
    if (result.rows.length !== 1) throw new Error('thread version conflict: ' + record.id);
    return threadFromRow(result.rows[0] as ThreadRow);
  }

  async listThreads(scope: RuntimeScope, status?: ThreadRecord['status']): Promise<ThreadRecord[]> {
    const result = status
      ? await this.pool.query('SELECT * FROM runtime_threads WHERE tenant_id=$1 AND project_id=$2 AND workspace_id=$3 AND status=$4 ORDER BY created_at ASC', [scope.tenantId, scope.projectId, scope.workspaceId, status])
      : await this.pool.query('SELECT * FROM runtime_threads WHERE tenant_id=$1 AND project_id=$2 AND workspace_id=$3 ORDER BY created_at ASC', [scope.tenantId, scope.projectId, scope.workspaceId]);
    return result.rows.map((row) => threadFromRow(row as ThreadRow));
  }

  async appendEvent(input: AppendEventInput): Promise<RuntimeEventRecord> {
    if (!input.type.trim()) throw new Error('event.type is empty');
    if (input.idempotencyKey) {
      const existing = await this.pool.query('SELECT * FROM runtime_events WHERE idempotency_key=$1', [input.idempotencyKey]);
      if (existing.rows[0]) return eventFromRow(existing.rows[0] as EventRow);
    }
    return this.tx(async (client) => {
      const thread = await client.query('SELECT id FROM runtime_threads WHERE id=$1', [input.threadId]);
      if (!thread.rows[0]) throw new Error('unknown thread: ' + input.threadId);
      const last = await client.query('SELECT COALESCE(MAX(seq),0) AS seq FROM runtime_events WHERE thread_id=$1', [input.threadId]);
      const seq = Number((last.rows[0] as { seq: number }).seq) + 1;
      if (input.expectedSeq !== undefined && input.expectedSeq !== seq) throw new Error('event sequence conflict: expected ' + input.expectedSeq + ' got ' + seq);
      const event: RuntimeEventRecord = { schemaVersion: 1, id: String(newId('evt')), threadId: input.threadId, seq, type: input.type, at: this.clock(), data: input.data, idempotencyKey: input.idempotencyKey };
      await client.query('INSERT INTO runtime_events (id,thread_id,seq,type,at,data_json,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.id, event.threadId, event.seq, event.type, event.at, JSON.stringify(event.data), event.idempotencyKey ?? null]);
      return event;
    });
  }

  async listEvents(threadId: string, afterSeq = 0, limit = 100): Promise<RuntimeEventRecord[]> {
    const result = await this.pool.query('SELECT * FROM runtime_events WHERE thread_id=$1 AND seq>$2 ORDER BY seq ASC LIMIT $3', [threadId, afterSeq, limit]);
    return result.rows.map((row) => eventFromRow(row as EventRow));
  }

  async acquireLease(input: AcquireLeaseInput): Promise<WorkerLeaseRecord> {
    const now = this.clock();
    if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error('lease ttl must be positive');
    return this.tx(async (client) => {
      const thread = await client.query('SELECT tenant_id,project_id,workspace_id FROM runtime_threads WHERE id=$1', [input.threadId]);
      const row = thread.rows[0] as { tenant_id: string; project_id: string; workspace_id: string } | undefined;
      if (!row) throw new Error('unknown thread: ' + input.threadId);
      assertSameScope(input.scope, scopeOf(row.tenant_id, row.project_id, row.workspace_id));
      const active = await client.query("SELECT id FROM runtime_worker_leases WHERE thread_id=$1 AND status='running' AND lease_until>$2", [input.threadId, now]);
      if (active.rows[0]) throw new Error('thread already has an active lease');
      const lease: WorkerLeaseRecord = { schemaVersion: 1, id: String(newId('lease')), threadId: input.threadId, scope: input.scope, status: 'running', configVersion: input.configVersion, model: input.model, sandbox: input.sandbox, leaseUntil: now + input.ttlMs, heartbeatAt: now, createdAt: now };
      await client.query('INSERT INTO runtime_worker_leases (id,thread_id,tenant_id,project_id,workspace_id,status,config_version,model,sandbox,lease_until,heartbeat_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [lease.id, lease.threadId, lease.scope.tenantId, lease.scope.projectId, lease.scope.workspaceId, lease.status, lease.configVersion, lease.model, lease.sandbox, lease.leaseUntil, lease.heartbeatAt, lease.createdAt]);
      return validateWorkerLease(lease);
    });
  }

  async heartbeatLease(leaseId: string, ttlMs: number, at = this.clock()): Promise<WorkerLeaseRecord> {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('lease ttl must be positive');
    const result = await this.pool.query("UPDATE runtime_worker_leases SET heartbeat_at=$1, lease_until=$2 WHERE id=$3 AND status='running' RETURNING *", [at, at + ttlMs, leaseId]);
    if (!result.rows[0]) throw new Error('lease is not running: ' + leaseId);
    return leaseFromRow(result.rows[0] as LeaseRow);
  }

  async releaseLease(leaseId: string): Promise<void> {
    await this.pool.query("UPDATE runtime_worker_leases SET status='stopped' WHERE id=$1", [leaseId]);
  }

  async listExpiredLeases(now = this.clock()): Promise<WorkerLeaseRecord[]> {
    const result = await this.pool.query("SELECT * FROM runtime_worker_leases WHERE status='running' AND lease_until<=$1 ORDER BY lease_until ASC", [now]);
    return result.rows.map((row) => leaseFromRow(row as LeaseRow));
  }

  async putMandate(mandate: MandateRecord): Promise<MandateRecord> {
    const record = validateMandate(mandate);
    await this.pool.query('INSERT INTO runtime_mandates (id,thread_id,tenant_id,project_id,workspace_id,capabilities_json,permissions_json,expires_at,version,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(thread_id) DO UPDATE SET id=EXCLUDED.id, capabilities_json=EXCLUDED.capabilities_json, permissions_json=EXCLUDED.permissions_json, expires_at=EXCLUDED.expires_at, version=EXCLUDED.version, created_at=EXCLUDED.created_at', [record.id, record.threadId, record.scope.tenantId, record.scope.projectId, record.scope.workspaceId, JSON.stringify(record.capabilities), JSON.stringify(record.permissions), record.expiresAt, record.version, record.createdAt]);
    return record;
  }

  async getMandate(threadId: string): Promise<MandateRecord | null> {
    const result = await this.pool.query('SELECT * FROM runtime_mandates WHERE thread_id=$1', [threadId]);
    return result.rows[0] ? mandateFromRow(result.rows[0] as MandateRow) : null;
  }

  async putCapability(capability: CapabilityManifest): Promise<CapabilityManifest> {
    const record = validateCapabilityManifest(capability);
    await this.pool.query('INSERT INTO runtime_capabilities (name,version,id,instructions,description,tools_json,permissions_json,sandbox,evals_json,entry,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(name,version) DO UPDATE SET id=EXCLUDED.id, instructions=EXCLUDED.instructions, description=EXCLUDED.description, tools_json=EXCLUDED.tools_json, permissions_json=EXCLUDED.permissions_json, sandbox=EXCLUDED.sandbox, evals_json=EXCLUDED.evals_json, entry=EXCLUDED.entry', [record.name, record.version, record.id ?? null, record.instructions ?? null, record.description, JSON.stringify(record.tools), JSON.stringify(record.permissions), record.sandbox, JSON.stringify(record.evals), record.entry ?? null, this.clock()]);
    return record;
  }

  async getCapability(name: string, version: string): Promise<CapabilityManifest | null> {
    const result = await this.pool.query('SELECT * FROM runtime_capabilities WHERE name=$1 AND version=$2', [name, version]);
    return result.rows[0] ? capabilityFromRow(result.rows[0] as CapabilityRow) : null;
  }

  async listCapabilities(): Promise<CapabilityManifest[]> {
    const result = await this.pool.query('SELECT * FROM runtime_capabilities ORDER BY name, version');
    return result.rows.map((row) => capabilityFromRow(row as CapabilityRow));
  }

  async enqueueOutbox(input: EnqueueOutboxInput): Promise<OutboxRecord> {
    const now = this.clock();
    const record: OutboxRecord = { schemaVersion: 1, id: String(newId('outbox')), threadId: input.threadId, topic: input.topic, payload: input.payload, status: 'pending', attempts: 0, nextAttemptAt: input.notBefore ?? now, createdAt: now, updatedAt: now };
    await this.pool.query('INSERT INTO runtime_outbox (id,thread_id,topic,payload_json,status,attempts,next_attempt_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [record.id, record.threadId, record.topic, JSON.stringify(record.payload), record.status, record.attempts, record.nextAttemptAt, record.createdAt, record.updatedAt]);
    return validateOutbox(record);
  }

  async claimOutbox(workerId: string, limit: number): Promise<OutboxRecord[]> {
    const now = this.clock();
    return this.tx(async (client) => {
      const rows = (await client.query("SELECT * FROM runtime_outbox WHERE status IN ('pending','failed') AND next_attempt_at<=$1 ORDER BY next_attempt_at ASC LIMIT $2", [now, limit])).rows as OutboxRow[];
      for (const row of rows) {
        await client.query("UPDATE runtime_outbox SET status='claimed', claimed_by=$1, claimed_at=$2, updated_at=$3 WHERE id=$4", [workerId, now, now, row.id]);
      }
      return rows.map((row) => outboxFromRow({ ...row, status: 'claimed', claimed_by: workerId, claimed_at: now, updated_at: now }));
    });
  }

  async completeOutbox(id: string): Promise<void> {
    const result = await this.pool.query("UPDATE runtime_outbox SET status='done', updated_at=$1 WHERE id=$2 RETURNING id", [this.clock(), id]);
    if (result.rows.length !== 1) throw new Error('unknown outbox: ' + id);
  }

  async failOutbox(id: string, error: string, retryAt: number): Promise<void> {
    const result = await this.pool.query("UPDATE runtime_outbox SET status='failed', attempts=attempts+1, next_attempt_at=$1, claimed_by=NULL, claimed_at=NULL, updated_at=$2 WHERE id=$3 RETURNING id", [retryAt, this.clock(), id]);
    if (result.rows.length !== 1) throw new Error('unknown outbox: ' + id + ' (' + error + ')');
  }
}
