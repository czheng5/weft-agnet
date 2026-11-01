-- Weft MemoryHub v1.0 schema (PostgreSQL + pgvector)
-- Apply once per MemoryHub database. Graph relations are kept in PG for v1.0.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  project_id TEXT,
  session_id TEXT,
  layer TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  structured_json TEXT,
  provenance TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  sensitivity TEXT NOT NULL,
  status TEXT NOT NULL,
  valid_from BIGINT NOT NULL,
  valid_until BIGINT,
  superseded_by TEXT,
  version INTEGER NOT NULL,
  source_event_ids_json TEXT NOT NULL,
  embedding vector(1536),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS memories_scope_idx ON memories (tenant_id, user_id, project_id, status);
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS memory_versions (
  memory_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (memory_id, version)
);

CREATE TABLE IF NOT EXISTS memory_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  memory_id TEXT,
  scope TEXT NOT NULL,
  at BIGINT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS memory_relations (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT NOT NULL,
  weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (from_id, to_id, type)
);

CREATE TABLE IF NOT EXISTS memory_outbox (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS memory_outbox_pending_idx ON memory_outbox (status, created_at);
