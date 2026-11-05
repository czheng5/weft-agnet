import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'pwa-t', projectId: 'pwa-p', workspaceId: 'pwa-w' };

test('gateway serves installable PWA manifest, icon and service worker', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-pwa-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const gateway = new AgentGateway({ store, scope });
  try {
    const base = (await gateway.start(0)).url;
    const manifest = await fetch(base + '/manifest.webmanifest');
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get('content-type') ?? '', /manifest\+json/);
    const json = await manifest.json() as { display: string; start_url: string };
    assert.equal(json.display, 'standalone');
    assert.equal(json.start_url, '/');
    const icon = await fetch(base + '/icon.svg');
    assert.match(icon.headers.get('content-type') ?? '', /image\/svg/);
    const sw = await fetch(base + '/sw.js');
    assert.match(sw.headers.get('content-type') ?? '', /javascript/);
    assert.match(await sw.text(), /serviceWorker|caches/);
    const surface = await (await fetch(base + '/')).text();
    assert.match(surface, /manifest\.webmanifest/);
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
