import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { hasV1State, readV1Snapshot, migrateV1ToRuntime } from '../src/core/v1-compat.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 't1', projectId: 'p1', workspaceId: 'w1' };

test('v1 snapshot is read-only and migrates into runtime store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-v1-'));
  const weft = join(dir, '.weft');
  mkdirSync(weft, { recursive: true });
  const graphPath = join(weft, 'workgraph.json');
  const capPath = join(weft, 'capabilities.json');
  writeFileSync(graphPath, JSON.stringify({
    version: 1,
    goal: {
      id: 'goal-v1', text: 'v1 goal', status: 'active', acceptance: ['works'],
      createdAt: 1000, updatedAt: 1000
    },
    tasks: [{
      id: 'task-v1', title: 'do it', status: 'done', dependsOn: [], acceptance: ['ok'],
      createdAt: 1000, updatedAt: 1000
    }]
  }, null, 2), 'utf8');
  writeFileSync(capPath, JSON.stringify({
    version: 1,
    capabilities: [{
      enabled: true, installedAt: 1000,
      manifest: {
        schemaVersion: 1, id: 'legacy.demo', name: 'Legacy', version: '1.0.0',
        description: 'old', tools: ['read_file'], permissions: ['fs:read'], eval: ['legacy-eval']
      }
    }]
  }, null, 2), 'utf8');
  const beforeGraph = readFileSync(graphPath, 'utf8');
  const beforeCap = readFileSync(capPath, 'utf8');

  try {
    assert.equal(hasV1State(dir), true);
    const snapshot = readV1Snapshot(dir);
    assert.equal(snapshot.workgraph?.goal.text, 'v1 goal');
    assert.equal(snapshot.capabilities.length, 1);

    const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 2000 });
    try {
      const result = await migrateV1ToRuntime(dir, store, scope, 2000);
      assert.equal(result.thread.title, 'v1 goal');
      assert.equal(result.graph.threadId, result.thread.id);
      assert.equal((await store.getThread(result.thread.id))?.title, 'v1 goal');
      assert.equal((await store.listEvents(result.thread.id)).length, 1);
      assert.equal((await store.getCapability('Legacy', '1.0.0'))?.id, 'legacy.demo');
    } finally {
      store.close();
    }

    assert.equal(readFileSync(graphPath, 'utf8'), beforeGraph);
    assert.equal(readFileSync(capPath, 'utf8'), beforeCap);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
