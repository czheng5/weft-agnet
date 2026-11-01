import test from 'node:test';
import assert from 'node:assert/strict';
import { probePgVector } from '../src/core/pgvector-probe.ts';

test('pgvector probe reports installed extension', async () => {
  const pool = { query: async () => ({ rows: [{ extversion: '0.8.1' }] }) };
  const result = await probePgVector(pool);
  assert.equal(result.available, true);
  assert.equal(result.version, '0.8.1');
});

test('pgvector probe fails closed when missing', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  const result = await probePgVector(pool);
  assert.equal(result.available, false);
});
