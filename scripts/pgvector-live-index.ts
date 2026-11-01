import { createPostgresMemoryProvider } from '../src/core/memory-postgres.ts';
import { MemoryHub } from '../src/core/memory-hub.ts';
import { PgVectorIndex } from '../src/core/pgvector-index.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(id: string, content: string): MemoryRecord {
  const now = Date.now();
  return {
    id,
    scope: { tenantId: 'vec-live', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'fact',
    content,
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
  const provider = await createPostgresMemoryProvider({ connectionString: url, id: 'pgvector-live' });
  const hub = new MemoryHub({
    provider,
    embedding: {
      async embed(texts) {
        return texts.map((text) => {
          const vector = new Array(1536).fill(0);
          vector[text.includes('alpha') ? 0 : 1] = 1;
          return vector;
        });
      }
    },
    asyncVectorIndex: new PgVectorIndex({ pool: provider.pool })
  });
  try {
    await hub.write([record('alpha-live', 'alpha memory'), record('beta-live', 'beta related')]);
    const hits = await hub.search({ text: 'zzz', scope: { tenantId: 'vec-live', userId: 'u1', projectId: 'p1' }, topK: 5 });
    const vectorHit = hits.find((hit) => hit.record.id === 'beta-live' && hit.matchedBy.includes('vector'));
    if (!vectorHit) throw new Error('no vector hit');
    console.log('PGVECTOR INDEX LIVE PASS');
    console.log('  hits=' + hits.length + ' vectorHit=' + vectorHit.record.id + ' score=' + vectorHit.score.toFixed(2));
  } finally {
    await hub.close();
  }
}

main().catch((error) => {
  console.error('PGVECTOR INDEX LIVE FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
