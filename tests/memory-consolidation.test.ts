import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { MemoryConsolidator } from '../src/core/memory-consolidation.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(id: string, content: string): MemoryRecord {
  const now = Date.now();
  return {
    id,
    scope: { tenantId: 't1', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'preference',
    content,
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: ['evt-1'],
    createdAt: now,
    updatedAt: now
  };
}

test('consolidator supersedes conflicting preference', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cons-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  try {
    await provider.write([record('mem-old', 'user prefers window seats')]);
    const consolidator = new MemoryConsolidator(provider);
    const result = await consolidator.consolidate(record('mem-new', 'user prefers aisle seats'));
    assert.equal(result.action, 'superseded');
    assert.deepEqual(result.supersededIds, ['mem-old']);
    const old = await provider.get('mem-old', { tenantId: 't1' });
    assert.equal(old?.status, 'contested');
    assert.equal(old?.supersededBy, 'mem-new');
    assert.equal(old?.version, 2);
    const next = await provider.get('mem-new', { tenantId: 't1' });
    assert.equal(next?.status, 'active');
  } finally {
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('consolidator detects duplicate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cons-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  try {
    await provider.write([record('mem-old', 'user prefers window seats')]);
    const consolidator = new MemoryConsolidator(provider);
    const result = await consolidator.consolidate(record('mem-new', '  user prefers   window seats '));
    assert.equal(result.action, 'duplicate');
    assert.equal(await provider.get('mem-new', { tenantId: 't1' }), null);
  } finally {
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manual resolution leaves conflict for review', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cons-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  try {
    await provider.write([record('mem-old', 'user prefers window seats')]);
    const consolidator = new MemoryConsolidator(provider, { resolution: 'manual' });
    const result = await consolidator.consolidate(record('mem-new', 'user prefers aisle seats'));
    assert.equal(result.action, 'conflict');
    assert.equal(result.written.length, 0);
    assert.equal(await provider.get('mem-new', { tenantId: 't1' }), null);
  } finally {
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
