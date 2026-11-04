import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import type { Principal } from '../src/core/access.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'rbac-t', projectId: 'rbac-p', workspaceId: 'rbac-w' };
const principals: Principal[] = [
  { id: 'r', token: 'r', role: 'reader', scope },
  { id: 'w', token: 'w', role: 'writer', scope },
  { id: 'a', token: 'a', role: 'admin', scope }
];

test('gateway enforces roles and tenant quotas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-rbac-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const gateway = new AgentGateway({ store, scope, principals, quota: { maxThreads: 1, maxMessagesPerThread: 1 } });
  try {
    const base = (await gateway.start(0)).url;
    const headers = (token: string) => ({ authorization: 'Bearer ' + token, 'content-type': 'application/json' });
    assert.equal((await fetch(base + '/threads', { headers: headers('r') })).status, 200);
    assert.equal((await fetch(base + '/threads', { method: 'POST', headers: headers('r'), body: JSON.stringify({ title: 'no' }) })).status, 403);
    const created = await fetch(base + '/threads', { method: 'POST', headers: headers('w'), body: JSON.stringify({ title: 'yes' }) });
    assert.equal(created.status, 201);
    const id = ((await created.json()) as { thread: { id: string } }).thread.id;
    assert.equal((await fetch(base + '/threads', { method: 'POST', headers: headers('w'), body: JSON.stringify({ title: 'quota' }) })).status, 429);
    assert.equal((await fetch(base + '/threads/' + id + '/messages', { method: 'POST', headers: headers('w'), body: JSON.stringify({ text: 'one' }) })).status, 202);
    assert.equal((await fetch(base + '/threads/' + id + '/messages', { method: 'POST', headers: headers('w'), body: JSON.stringify({ text: 'two' }) })).status, 429);
    const capability = { schemaVersion: 1, name: 'rbac.demo', version: '1.0.0', description: 'x', tools: [], permissions: { read: [], write: [], exec: [], network: [] }, sandbox: 'any', evals: [] };
    assert.equal((await fetch(base + '/capabilities', { method: 'POST', headers: headers('w'), body: JSON.stringify(capability) })).status, 403);
    assert.equal((await fetch(base + '/capabilities', { method: 'POST', headers: headers('a'), body: JSON.stringify(capability) })).status, 201);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
