import { createPostgresMemoryProvider } from '../src/core/memory-postgres.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(id: string): MemoryRecord {
  const now = Date.now();
  return {
    id,
    scope: { tenantId: 'live', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'fact',
    content: 'live postgres memory ' + id,
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: [],
    createdAt: now,
    updatedAt: now
  };
}

async function main(): Promise<void> {
  const url = process.env.WEFT_PG_URL;
  if (!url) throw new Error('WEFT_PG_URL is required');
  const provider = await createPostgresMemoryProvider({ connectionString: url, id: 'postgres-live' });
  try {
    const receipts = await provider.write([record('live-1')]);
    if (receipts[0]?.status !== 'committed') throw new Error('write failed');
    const got = await provider.get('live-1', { tenantId: 'live', userId: 'u1', projectId: 'p1' });
    if (got?.content !== 'live postgres memory live-1') throw new Error('get failed');
    const hits = await provider.search({ text: 'postgres memory', scope: { tenantId: 'live' } });
    if (hits.length !== 1) throw new Error('search failed');
    const forgotten = await provider.forget({ scope: { tenantId: 'live' }, ids: ['live-1'] });
    if (forgotten.propagation !== 'complete') throw new Error('forget failed');
    const health = await provider.health();
    if (!health.ok) throw new Error('health failed');
    console.log('POSTGRES LIVE CONTRACT PASS');
    console.log('  write=committed get=ok search=' + hits.length + ' forget=complete health=' + health.ok);
  } finally {
    await provider.close();
  }
}

main().catch((error) => {
  console.error('POSTGRES LIVE CONTRACT FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
