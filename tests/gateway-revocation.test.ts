import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import { FileRevocationStore } from '../src/core/token-revocation.ts';
import type { Principal } from '../src/core/access.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'rev-t', projectId: 'rev-p', workspaceId: 'rev-w' };
const principals: Principal[] = [
  { id: 'w', token: 'w', role: 'writer', scope },
  { id: 'a', token: 'a', role: 'admin', scope }
];

test('admin can revoke a jti through the gateway', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-rev-api-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const revocations = new FileRevocationStore(join(dir, 'revocations.json'));
  const gateway = new AgentGateway({ store, scope, principals, revocations });
  try {
    const base = (await gateway.start(0)).url;
    const headers = (token: string) => ({ authorization: 'Bearer ' + token, 'content-type': 'application/json' });
    assert.equal((await fetch(base + '/auth/revoke', { method: 'POST', headers: headers('w'), body: JSON.stringify({ jti: 'x', expiresAt: 999999 }) })).status, 403);
    const response = await fetch(base + '/auth/revoke', { method: 'POST', headers: headers('a'), body: JSON.stringify({ jti: 'jti-x', expiresAt: Date.now() + 60000 }) });
    assert.equal(response.status, 200);
    assert.equal(revocations.isRevoked('jti-x'), true);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
