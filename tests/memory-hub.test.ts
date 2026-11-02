import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { MemoryHub } from '../src/core/memory-hub.ts';
import { InMemoryVectorIndex } from '../src/core/vector-index.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(id: string, content: string): MemoryRecord {
  const now = Date.now();
  return {
    id,
    scope: { tenantId: 't1', userId: 'u1', projectId: 'p1' },
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


test('MemoryHub hybrid vector recall', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-hub-vec-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  const embedding = {
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => text.includes('alpha') ? [1, 0] : [0, 1]);
    }
  };
  const vectorIndex = new InMemoryVectorIndex();
  const hub = new MemoryHub({ provider, workspace: dir, embedding, vectorIndex });
  try {
    await hub.write([record('a', 'alpha memory'), record('b', 'beta related')]);
    const hits = await hub.search({ text: 'zzz', scope: { tenantId: 't1' }, topK: 5 });
    assert.equal(hits.length, 2);
    assert.equal(hits.some((hit) => hit.record.id === 'b' && hit.matchedBy.includes('vector')), true);
    assert.equal(vectorIndex.size(), 2);
  } finally {
    await hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MemoryHub graph expansion and outbox', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-hub-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  const hub = new MemoryHub({ provider, workspace: dir });
  try {
    await hub.write([record('a', 'alpha memory'), record('b', 'beta related')], [
      { from: 'a', to: 'b', type: 'related', weight: 0.9 }
    ]);
    assert.equal(hub.outbox.pending().length, 2);
    const hits = await hub.search({ text: 'alpha', scope: { tenantId: 't1' }, topK: 5 });
    assert.equal(hits.length, 2);
    assert.equal(hits.some((hit) => hit.record.id === 'b' && hit.matchedBy.includes('graph')), true);
    const drained = await hub.outbox.drain(async () => {});
    assert.equal(drained, 2);
    assert.equal(hub.outbox.pending().length, 0);
    await hub.forget({ scope: { tenantId: 't1' }, ids: ['a'] });
    assert.equal(hub.outbox.pending()[0].type, 'memory.forgotten');
    assert.equal(hub.relations.all().length, 1);
  } finally {
    await hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
