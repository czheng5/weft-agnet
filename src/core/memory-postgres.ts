import type {
  ForgetReceipt,
  ForgetSelector,
  MemoryHit,
  MemoryProvider,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  ProviderHealth,
  WriteReceipt
} from './memory.ts';

export interface PgQueryResult {
  rows: unknown[];
}

export interface PgClientLike {
  query(text: string, params?: unknown[]): Promise<PgQueryResult>;
  release?: () => void;
}

export interface PgPoolLike {
  query(text: string, params?: unknown[]): Promise<PgQueryResult>;
  connect(): Promise<PgClientLike>;
  end(): Promise<void>;
}

export interface PostgresMemoryOptions {
  connectionString?: string;
  pool?: PgPoolLike;
  id?: string;
}

export interface PostgresMemoryConfig {
  connectionString: string;
  id?: string;
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS memories (',
  '  id TEXT PRIMARY KEY,',
  '  tenant_id TEXT NOT NULL,',
  '  user_id TEXT,',
  '  project_id TEXT,',
  '  session_id TEXT,',
  '  layer TEXT NOT NULL,',
  '  kind TEXT NOT NULL,',
  '  content TEXT NOT NULL,',
  '  structured_json TEXT,',
  '  provenance TEXT NOT NULL,',
  '  confidence DOUBLE PRECISION NOT NULL,',
  '  sensitivity TEXT NOT NULL,',
  '  status TEXT NOT NULL,',
  '  valid_from BIGINT NOT NULL,',
  '  valid_until BIGINT,',
  '  superseded_by TEXT,',
  '  version INTEGER NOT NULL,',
  '  source_event_ids_json TEXT NOT NULL,',
  '  created_at BIGINT NOT NULL,',
  '  updated_at BIGINT NOT NULL',
  ');',
  'CREATE TABLE IF NOT EXISTS memory_versions (',
  '  memory_id TEXT NOT NULL,',
  '  version INTEGER NOT NULL,',
  '  content TEXT NOT NULL,',
  '  created_at BIGINT NOT NULL,',
  '  PRIMARY KEY (memory_id, version)',
  ');',
  'CREATE TABLE IF NOT EXISTS memory_audit (',
  '  id BIGSERIAL PRIMARY KEY,',
  '  action TEXT NOT NULL,',
  '  memory_id TEXT,',
  '  scope TEXT NOT NULL,',
  '  at BIGINT NOT NULL,',
  '  detail TEXT',
  ');'
].join('\n');

interface MemoryRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  project_id: string | null;
  session_id: string | null;
  layer: string;
  kind: string;
  content: string;
  structured_json: string | null;
  provenance: string;
  confidence: number;
  sensitivity: string;
  status: string;
  valid_from: string | number;
  valid_until: string | number | null;
  superseded_by: string | null;
  version: number;
  source_event_ids_json: string;
  created_at: string | number;
  updated_at: string | number;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/).filter((t) => t.length > 0);
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    scope: {
      tenantId: row.tenant_id,
      userId: row.user_id ?? undefined,
      projectId: row.project_id ?? undefined,
      sessionId: row.session_id ?? undefined
    },
    layer: row.layer as MemoryRecord['layer'],
    kind: row.kind as MemoryRecord['kind'],
    content: row.content,
    structured: row.structured_json ? JSON.parse(row.structured_json) : undefined,
    provenance: row.provenance as MemoryRecord['provenance'],
    confidence: Number(row.confidence),
    sensitivity: row.sensitivity as MemoryRecord['sensitivity'],
    status: row.status as MemoryRecord['status'],
    validFrom: Number(row.valid_from),
    validUntil: row.valid_until === null ? undefined : Number(row.valid_until),
    supersededBy: row.superseded_by ?? undefined,
    version: Number(row.version),
    sourceEventIds: JSON.parse(row.source_event_ids_json) as string[],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function scopeClause(scope: MemoryScope, start = 1): { sql: string; params: unknown[]; next: number } {
  const params: unknown[] = [scope.tenantId];
  let sql = 'tenant_id = $' + start;
  let index = start + 1;
  if (scope.userId) { sql += ' AND user_id = $' + index++; params.push(scope.userId); }
  if (scope.projectId) { sql += ' AND project_id = $' + index++; params.push(scope.projectId); }
  if (scope.sessionId) { sql += ' AND session_id = $' + index++; params.push(scope.sessionId); }
  return { sql, params, next: index };
}

export class PostgresMemoryProvider implements MemoryProvider {
  readonly id: string;
  readonly pool: PgPoolLike;
  private initialized = false;

  constructor(opts: PostgresMemoryOptions) {
    if (!opts.pool) throw new Error('PostgresMemoryProvider requires a pool');
    this.pool = opts.pool;
    this.id = opts.id ?? 'postgres-memoryhub';
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.pool.query(SCHEMA);
    this.initialized = true;
  }

  async write(records: MemoryRecord[]): Promise<WriteReceipt[]> {
    await this.init();
    const out: WriteReceipt[] = [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const record of records) {
        const existingResult = await client.query('SELECT version, content FROM memories WHERE id = $1', [record.id]);
        const existing = existingResult.rows[0] as { version: number; content: string } | undefined;
        if (existing && record.version <= Number(existing.version)) {
          out.push(existing.content === record.content
            ? { id: record.id, version: Number(existing.version), status: 'committed' }
            : { id: record.id, version: Number(existing.version), status: 'rejected', reason: 'stale version' });
          continue;
        }
        const version = existing ? Math.max(record.version, Number(existing.version) + 1) : record.version;
        if (existing) {
          await client.query(
            'UPDATE memories SET tenant_id=$1, user_id=$2, project_id=$3, session_id=$4, layer=$5, kind=$6, content=$7, structured_json=$8, provenance=$9, confidence=$10, sensitivity=$11, status=$12, valid_from=$13, valid_until=$14, superseded_by=$15, version=$16, source_event_ids_json=$17, updated_at=$18 WHERE id=$19',
            [record.scope.tenantId, record.scope.userId ?? null, record.scope.projectId ?? null, record.scope.sessionId ?? null, record.layer, record.kind, record.content, record.structured === undefined ? null : JSON.stringify(record.structured), record.provenance, record.confidence, record.sensitivity, record.status, record.validFrom, record.validUntil ?? null, record.supersededBy ?? null, version, JSON.stringify(record.sourceEventIds), record.updatedAt, record.id]
          );
        } else {
          await client.query(
            'INSERT INTO memories (id, tenant_id, user_id, project_id, session_id, layer, kind, content, structured_json, provenance, confidence, sensitivity, status, valid_from, valid_until, superseded_by, version, source_event_ids_json, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)',
            [record.id, record.scope.tenantId, record.scope.userId ?? null, record.scope.projectId ?? null, record.scope.sessionId ?? null, record.layer, record.kind, record.content, record.structured === undefined ? null : JSON.stringify(record.structured), record.provenance, record.confidence, record.sensitivity, record.status, record.validFrom, record.validUntil ?? null, record.supersededBy ?? null, version, JSON.stringify(record.sourceEventIds), record.createdAt, record.updatedAt]
          );
        }
        await client.query('INSERT INTO memory_versions (memory_id, version, content, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (memory_id, version) DO UPDATE SET content=excluded.content', [record.id, version, record.content, record.updatedAt]);
        await client.query('INSERT INTO memory_audit (action, memory_id, scope, at, detail) VALUES ($1,$2,$3,$4,$5)', [existing ? 'update' : 'create', record.id, record.scope.tenantId, Date.now(), null]);
        out.push({ id: record.id, version, status: 'committed' });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release?.();
    }
    return out;
  }

  async get(id: string, scope: MemoryScope): Promise<MemoryRecord | null> {
    await this.init();
    const where = scopeClause(scope);
    const result = await this.pool.query('SELECT * FROM memories WHERE id = $' + where.next + ' AND ' + where.sql, [...where.params, id]);
    const row = result.rows[0] as MemoryRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    await this.init();
    const where = scopeClause(query.scope);
    const result = await this.pool.query('SELECT * FROM memories WHERE ' + where.sql + ' AND status <> $' + where.next, [...where.params, 'deleted']);
    const terms = tokenize(query.text);
    const hits: MemoryHit[] = [];
    for (const raw of result.rows) {
      const record = rowToRecord(raw as MemoryRow);
      if (query.layers && !query.layers.includes(record.layer)) continue;
      if (query.kinds && !query.kinds.includes(record.kind)) continue;
      if (query.minConfidence !== undefined && record.confidence < query.minConfidence) continue;
      const text = record.content.toLowerCase();
      let lexical = 0;
      for (const term of terms) if (text.includes(term)) lexical += 1;
      if (terms.length > 0 && lexical === 0) continue;
      const recency = Math.max(0, 1 - (Date.now() - record.updatedAt) / (1000 * 60 * 60 * 24 * 30));
      hits.push({ record, score: lexical * 0.7 + record.confidence * 0.2 + recency * 0.1, matchedBy: ['lexical', 'recency'] });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, query.topK ?? 5);
  }

  async forget(selector: ForgetSelector): Promise<ForgetReceipt> {
    await this.init();
    const where = scopeClause(selector.scope);
    let sql = 'SELECT id FROM memories WHERE ' + where.sql;
    const params: unknown[] = [...where.params];
    let index = where.next;
    if (selector.ids && selector.ids.length > 0) {
      sql += ' AND id IN (' + selector.ids.map(() => '$' + index++).join(',') + ')';
      params.push(...selector.ids);
    }
    if (selector.kind) { sql += ' AND kind = $' + index++; params.push(selector.kind); }
    if (selector.before) { sql += ' AND updated_at < $' + index++; params.push(selector.before); }
    const result = await this.pool.query(sql, params);
    for (const row of result.rows as Array<{ id: string }>) {
      await this.pool.query('UPDATE memories SET status=$1, version=version+1, updated_at=$2 WHERE id=$3', ['deleted', Date.now(), row.id]);
      await this.pool.query('INSERT INTO memory_audit (action, memory_id, scope, at, detail) VALUES ($1,$2,$3,$4,$5)', ['forget', row.id, selector.scope.tenantId, Date.now(), selector.hard ? 'hard' : 'soft']);
    }
    return { accepted: result.rows.length, tombstoned: result.rows.length, propagation: 'complete' };
  }

  async health(): Promise<ProviderHealth> {
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, detail: 'postgres ' + this.id };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createPostgresMemoryProvider(config: PostgresMemoryConfig): Promise<PostgresMemoryProvider> {
  const pg = await import('pg');
  const Pool = (pg as unknown as { Pool: new (options: { connectionString: string }) => PgPoolLike }).Pool;
  const pool = new Pool({ connectionString: config.connectionString });
  const provider = new PostgresMemoryProvider({ pool, id: config.id });
  await provider.init();
  return provider;
}
