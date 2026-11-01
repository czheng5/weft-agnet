export interface PgVectorProbePool {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface PgVectorProbeResult {
  available: boolean;
  version?: string;
  reason: string;
}

export async function probePgVector(pool: PgVectorProbePool): Promise<PgVectorProbeResult> {
  try {
    const result = await pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    const row = result.rows[0] as { extversion?: string } | undefined;
    if (row?.extversion) return { available: true, version: row.extversion, reason: 'pgvector installed' };
    return { available: false, reason: 'pgvector extension not installed' };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
