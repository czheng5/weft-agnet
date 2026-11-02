import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface MemoryScope {
  tenantId: string;
  userId?: string;
  projectId?: string;
  sessionId?: string;
}

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  layer: 'working' | 'episodic' | 'semantic' | 'procedural';
  kind: 'fact' | 'preference' | 'decision' | 'experience' | 'skill';
  content: string;
  structured?: unknown;
  provenance: 'user_stated' | 'agent_inferred' | 'third_party';
  confidence: number;
  sensitivity: 'public' | 'internal' | 'private' | 'secret';
  status: 'active' | 'contested' | 'deleted';
  validFrom: number;
  validUntil?: number;
  supersededBy?: string;
  version: number;
  sourceEventIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MemoryQuery {
  text: string;
  scope: MemoryScope;
  layers?: MemoryRecord['layer'][];
  kinds?: MemoryRecord['kind'][];
  topK?: number;
  minConfidence?: number;
  includeDeleted?: boolean;
  timeoutMs?: number;
}

export interface MemoryHit {
  record: MemoryRecord;
  score: number;
  matchedBy: ('vector' | 'lexical' | 'graph' | 'recency')[];
}

export interface WriteReceipt {
  id: string;
  version: number;
  status: 'committed' | 'queued' | 'rejected';
  reason?: string;
}

export interface ForgetSelector {
  scope: MemoryScope;
  ids?: string[];
  kind?: MemoryRecord['kind'];
  before?: number;
  hard?: boolean;
}

export interface ForgetReceipt {
  accepted: number;
  tombstoned: number;
  propagation: 'pending' | 'complete';
}

export interface ProviderHealth {
  ok: boolean;
  detail?: string;
  indexLagMs?: number;
  outboxLagMs?: number;
}

export interface MemoryProvider {
  readonly id: string;
  write(records: MemoryRecord[]): Promise<WriteReceipt[]>;
  search(query: MemoryQuery): Promise<MemoryHit[]>;
  get(id: string, scope: MemoryScope): Promise<MemoryRecord | null>;
  forget(selector: ForgetSelector): Promise<ForgetReceipt>;
  health(): Promise<ProviderHealth>;
}

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
  valid_from: number;
  valid_until: number | null;
  superseded_by: string | null;
  version: number;
  source_event_ids_json: string;
  created_at: number;
  updated_at: number;
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
  '  confidence REAL NOT NULL,',
  '  sensitivity TEXT NOT NULL,',
  '  status TEXT NOT NULL,',
  '  valid_from INTEGER NOT NULL,',
  '  valid_until INTEGER,',
  '  superseded_by TEXT,',
  '  version INTEGER NOT NULL,',
  '  source_event_ids_json TEXT NOT NULL,',
  '  created_at INTEGER NOT NULL,',
  '  updated_at INTEGER NOT NULL',
  ');',
  'CREATE TABLE IF NOT EXISTS memory_versions (',
  '  memory_id TEXT NOT NULL,',
  '  version INTEGER NOT NULL,',
  '  content TEXT NOT NULL,',
  '  created_at INTEGER NOT NULL,',
  '  PRIMARY KEY (memory_id, version)',
  ');',
  'CREATE TABLE IF NOT EXISTS memory_audit (',
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
  '  action TEXT NOT NULL,',
  '  memory_id TEXT,',
  '  scope TEXT NOT NULL,',
  '  at INTEGER NOT NULL,',
  '  detail TEXT',
  ');'
].join('\n');

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
    confidence: row.confidence,
    sensitivity: row.sensitivity as MemoryRecord['sensitivity'],
    status: row.status as MemoryRecord['status'],
    validFrom: row.valid_from,
    validUntil: row.valid_until ?? undefined,
    supersededBy: row.superseded_by ?? undefined,
    version: row.version,
    sourceEventIds: JSON.parse(row.source_event_ids_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class SqliteMemoryProvider implements MemoryProvider {
  readonly id: string;
  private readonly db: DatabaseSync;

  constructor(path: string, id = 'sqlite-dev') {
    this.id = id;
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  private scopeWhere(scope: MemoryScope): { sql: string; params: unknown[] } {
    let sql = 'tenant_id = ?';
    const params: unknown[] = [scope.tenantId];
    if (scope.userId) { sql += ' AND user_id = ?'; params.push(scope.userId); }
    if (scope.projectId) { sql += ' AND project_id = ?'; params.push(scope.projectId); }
    if (scope.sessionId) { sql += ' AND session_id = ?'; params.push(scope.sessionId); }
    return { sql, params };
  }

  async write(records: MemoryRecord[]): Promise<WriteReceipt[]> {
    const out: WriteReceipt[] = [];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const record of records) {
        const existing = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(record.id) as MemoryRow | undefined;
        if (existing) {
          if (record.version <= existing.version) {
            if (existing.content === record.content) {
              out.push({ id: record.id, version: existing.version, status: 'committed' });
            } else {
              out.push({ id: record.id, version: existing.version, status: 'rejected', reason: 'stale version' });
            }
            continue;
          }
        }
        const version = existing ? Math.max(record.version, existing.version + 1) : record.version;
        this.db.prepare(
          'INSERT INTO memories (id, tenant_id, user_id, project_id, session_id, layer, kind, content, structured_json, provenance, confidence, sensitivity, status, valid_from, valid_until, superseded_by, version, source_event_ids_json, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET tenant_id=excluded.tenant_id, user_id=excluded.user_id, project_id=excluded.project_id, session_id=excluded.session_id, layer=excluded.layer, kind=excluded.kind, content=excluded.content, structured_json=excluded.structured_json, provenance=excluded.provenance, confidence=excluded.confidence, sensitivity=excluded.sensitivity, status=excluded.status, valid_from=excluded.valid_from, valid_until=excluded.valid_until, superseded_by=excluded.superseded_by, version=excluded.version, source_event_ids_json=excluded.source_event_ids_json, updated_at=excluded.updated_at'
        ).run(
          record.id,
          record.scope.tenantId,
          record.scope.userId ?? null,
          record.scope.projectId ?? null,
          record.scope.sessionId ?? null,
          record.layer,
          record.kind,
          record.content,
          record.structured === undefined ? null : JSON.stringify(record.structured),
          record.provenance,
          record.confidence,
          record.sensitivity,
          record.status,
          record.validFrom,
          record.validUntil ?? null,
          record.supersededBy ?? null,
          version,
          JSON.stringify(record.sourceEventIds),
          record.createdAt,
          record.updatedAt
        );
        this.db.prepare('INSERT OR REPLACE INTO memory_versions (memory_id, version, content, created_at) VALUES (?, ?, ?, ?)')
          .run(record.id, version, record.content, record.updatedAt);
        this.db.prepare('INSERT INTO memory_audit (action, memory_id, scope, at, detail) VALUES (?, ?, ?, ?, ?)')
          .run(existing ? 'update' : 'create', record.id, record.scope.tenantId, Date.now(), null);
        out.push({ id: record.id, version, status: 'committed' });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return out;
  }

  async get(id: string, scope: MemoryScope): Promise<MemoryRecord | null> {
    const where = this.scopeWhere(scope);
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ? AND ' + where.sql)
      .get(id, ...where.params) as MemoryRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const where = this.scopeWhere(query.scope);
    const rows = this.db.prepare('SELECT * FROM memories WHERE ' + where.sql + ' AND status != ?')
      .all(...where.params, 'deleted') as MemoryRow[];
    const terms = tokenize(query.text);
    const hits: MemoryHit[] = [];
    for (const row of rows) {
      const record = rowToRecord(row);
      if (query.layers && !query.layers.includes(record.layer)) continue;
      if (query.kinds && !query.kinds.includes(record.kind)) continue;
      if (query.minConfidence !== undefined && record.confidence < query.minConfidence) continue;
      const text = record.content.toLowerCase();
      let lexical = 0;
      for (const term of terms) if (text.includes(term)) lexical += 1;
      const recency = Math.max(0, 1 - (Date.now() - record.updatedAt) / (1000 * 60 * 60 * 24 * 30));
      const score = lexical * 0.7 + record.confidence * 0.2 + recency * 0.1;
      if (terms.length > 0 && lexical === 0) continue;
      hits.push({ record, score, matchedBy: ['lexical', 'recency'] });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, query.topK ?? 5);
  }

  async forget(selector: ForgetSelector): Promise<ForgetReceipt> {
    const where = this.scopeWhere(selector.scope);
    let sql = 'SELECT id FROM memories WHERE ' + where.sql;
    const params: unknown[] = [...where.params];
    if (selector.ids && selector.ids.length > 0) {
      sql += ' AND id IN (' + selector.ids.map(() => '?').join(',') + ')';
      params.push(...selector.ids);
    }
    if (selector.kind) { sql += ' AND kind = ?'; params.push(selector.kind); }
    if (selector.before) { sql += ' AND updated_at < ?'; params.push(selector.before); }
    const rows = this.db.prepare(sql).all(...params) as { id: string }[];
    for (const row of rows) {
      this.db.prepare('UPDATE memories SET status = ?, version = version + 1, updated_at = ? WHERE id = ?')
        .run('deleted', Date.now(), row.id);
      this.db.prepare('INSERT INTO memory_audit (action, memory_id, scope, at, detail) VALUES (?, ?, ?, ?, ?)')
        .run('forget', row.id, selector.scope.tenantId, Date.now(), selector.hard ? 'hard' : 'soft');
    }
    return { accepted: rows.length, tombstoned: rows.length, propagation: 'complete' };
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true, detail: 'sqlite ' + this.id };
  }

  close(): void {
    this.db.close();
  }
}
