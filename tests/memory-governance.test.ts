import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { MemoryGovernance, MemoryAccessDenied } from '../src/core/memory-governance.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(projectId = 'p1'): MemoryRecord {
  const now = Date.now();
  return {
    id: 'gov-1',
    scope: { tenantId: 't1', userId: 'u1', projectId },
    layer: 'semantic',
    kind: 'fact',
    content: 'governed memory',
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

test('RBAC allows editor write/read but denies forget', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-gov-'));
  const inner = new SqliteMemoryProvider(join(dir, 'memory.db'));
  const audits: Array<{ action: string; allowed: boolean }> = [];
  const governed = new MemoryGovernance(inner, { tenantId: 't1', userId: 'u1', projectIds: ['p1'], role: 'editor' }, (e) => audits.push(e));
  try {
    assert.equal(inner.id, 'sqlite-dev');
    const receipts = await governed.write([record()]);
    assert.equal(receipts[0].status, 'committed');
    const hits = await governed.search({ text: 'governed', scope: { tenantId: 't1', projectId: 'p1' } });
    assert.equal(hits.length, 1);
    await assert.rejects(() => governed.forget({ scope: { tenantId: 't1', projectId: 'p1' }, ids: ['gov-1'] }), (e: unknown) => e instanceof MemoryAccessDenied);
    assert.equal(audits.some((a) => a.action === 'write' && a.allowed), true);
    assert.equal(audits.some((a) => a.action === 'forget' && !a.allowed), true);
  } finally {
    inner.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RBAC denies viewer write and cross-tenant/project access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-gov-'));
  const inner = new SqliteMemoryProvider(join(dir, 'memory.db'));
  try {
    const viewer = new MemoryGovernance(inner, { tenantId: 't1', projectIds: ['p1'], role: 'viewer' });
    await assert.rejects(() => viewer.write([record()]), /denied/);
    await assert.rejects(() => viewer.search({ text: 'x', scope: { tenantId: 't2', projectId: 'p1' } }), /tenant mismatch/);
    const editorOtherProject = new MemoryGovernance(inner, { tenantId: 't1', projectIds: ['p1'], role: 'editor' });
    await assert.rejects(() => editorOtherProject.search({ text: 'x', scope: { tenantId: 't1', projectId: 'p2' } }), /project not allowed/);
    const admin = new MemoryGovernance(inner, { tenantId: 't1', role: 'admin' });
    assert.equal((await admin.forget({ scope: { tenantId: 't1' } })).propagation, 'complete');
  } finally {
    inner.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
