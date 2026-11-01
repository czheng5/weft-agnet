import test from 'node:test';
import assert from 'node:assert/strict';
import { PgVectorIndex } from '../src/core/pgvector-index.ts';

test('PgVectorIndex issues vector SQL and maps distance', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params: params ?? [] });
      if (sql.startsWith('SELECT')) return { rows: [{ id: 'a', distance: 0.25 }] };
      return { rows: [] };
    }
  };
  const index = new PgVectorIndex({ pool });
  await index.add('a', [1, 0, 0]);
  assert.match(calls[0].sql, /::vector/);
  assert.match(String(calls[0].params[0]), /\[1,0,0\]/);
  const hits = await index.search([1, 0, 0], 3);
  assert.equal(hits[0].id, 'a');
  assert.equal(hits[0].score, 0.75);
  await index.remove('a');
  assert.match(calls[2].sql, /SET embedding = NULL/);
});
