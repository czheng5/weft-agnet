-- Weft M4 runtime schema (PostgreSQL)
-- Thin, durable control-plane schema. Implementations live in M5.

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

CREATE INDEX IF NOT EXISTS runtime_threads_scope_idx
  ON runtime_threads (tenant_id, project_id, workspace_id, status);

CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES runtime_threads(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  at BIGINT NOT NULL,
  data_json TEXT NOT NULL,
  idempotency_key TEXT,
  UNIQUE (thread_id, seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_events_idempotency_idx
  ON runtime_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS runtime_events_thread_seq_idx
  ON runtime_events (thread_id, seq);

CREATE TABLE IF NOT EXISTS runtime_worker_leases (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES runtime_threads(id),
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

CREATE INDEX IF NOT EXISTS runtime_worker_leases_expiry_idx
  ON runtime_worker_leases (status, lease_until);

CREATE TABLE IF NOT EXISTS runtime_mandates (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE REFERENCES runtime_threads(id),
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
  thread_id TEXT NOT NULL REFERENCES runtime_threads(id),
  topic TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_outbox_pending_idx
  ON runtime_outbox (status, next_attempt_at);

CREATE OR REPLACE FUNCTION runtime_events_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'runtime_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS runtime_events_no_update ON runtime_events;
CREATE TRIGGER runtime_events_no_update
  BEFORE UPDATE OR DELETE ON runtime_events
  FOR EACH ROW EXECUTE FUNCTION runtime_events_append_only();
