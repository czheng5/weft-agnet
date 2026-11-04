import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { Watchdog } from '../src/core/watchdog.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'watch-t', projectId: 'watch-p', workspaceId: 'watch-w' };

test('watchdog reports expired leases without mutating them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-watch-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const thread = createThreadRecord({ scope, title: 'watch', status: 'open', now: 1000 });
    await store.createThread(thread);
    const lease = await store.acquireLease({ threadId: thread.id, scope, configVersion: 'cfg', model: 'm', sandbox: 'bwrap', ttlMs: 10 });
    const seen: string[] = [];
    const watchdog = new Watchdog({ store, now: () => 2000, onAlert: (alert) => seen.push(alert.leaseId) });
    const alerts = await watchdog.scanOnce();
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].kind, 'expired-lease');
    assert.equal(alerts[0].leaseId, lease.id);
    assert.equal(seen[0], lease.id);
    assert.equal((await store.listExpiredLeases(2000)).length, 1);
    assert.equal(watchdog.isRunning(), false);
    watchdog.start();
    assert.equal(watchdog.isRunning(), true);
    watchdog.stop();
    assert.equal(watchdog.isRunning(), false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
