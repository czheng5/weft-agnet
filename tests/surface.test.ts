import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'surface-t', projectId: 'surface-p', workspaceId: 'surface-w' };

test('gateway serves the self-contained Weft Surface', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-surface-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const gateway = new AgentGateway({ store, scope });
  try {
    const address = await gateway.start(0);
    const response = await fetch(address.url + '/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    assert.match(html, /Weft Surface/);
    assert.match(html, /EventSource/);
    assert.match(html, /threads\/.*events\/stream/);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
