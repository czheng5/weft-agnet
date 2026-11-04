import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'cap-t', projectId: 'cap-p', workspaceId: 'cap-w' };

test('gateway exposes capability registry API', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cap-api-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const gateway = new AgentGateway({ store, scope });
  try {
    const base = (await gateway.start(0)).url;
    const manifest = {
      schemaVersion: 1, id: 'demo.api', name: 'Demo API', version: '1.0.0', description: 'api demo',
      tools: ['read_file'], permissions: { read: ['**'], write: [], exec: [], network: [] }, sandbox: 'any', evals: []
    };
    const created = await fetch(base + '/capabilities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(manifest) });
    assert.equal(created.status, 201);
    const one = await fetch(base + '/capabilities/demo.api/1.0.0');
    assert.equal(one.status, 200);
    assert.equal(((await one.json()) as { capability: { id: string } }).capability.id, 'demo.api');
    const list = await fetch(base + '/capabilities');
    assert.equal(((await list.json()) as { capabilities: unknown[] }).capabilities.length, 1);
    const invalid = await fetch(base + '/capabilities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...manifest, sandbox: 'nope' }) });
    assert.equal(invalid.status, 400);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
