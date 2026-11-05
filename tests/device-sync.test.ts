import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { DeviceRegistry, DeviceSyncService } from '../src/core/device-sync.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'sync-t', projectId: 'sync-p', workspaceId: 'sync-w' };

test('device registry hashes tokens and revokes cleanly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-device-'));
  try {
    const registry = new DeviceRegistry(join(dir, 'devices.json'), () => 1000);
    const created = registry.register('laptop');
    assert.equal(created.device.name, 'laptop');
    assert.equal(created.device.tokenHash.includes(created.token), false);
    assert.equal(registry.authenticate(created.token)?.id, created.device.id);
    registry.revoke(created.device.id);
    assert.equal(registry.authenticate(created.token), null);
    assert.equal(registry.list()[0].revokedAt, 1000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('device sync pulls only events after the cursor and stays scoped', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-sync-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  try {
    const registry = new DeviceRegistry(join(dir, 'devices.json'), () => 1000);
    const device = registry.register('tablet');
    const service = new DeviceSyncService(store, registry, () => 1000);
    const thread = createThreadRecord({ scope, title: 'sync', status: 'open', now: 1000 });
    const other = createThreadRecord({ scope: { ...scope, tenantId: 'other' }, title: 'other', status: 'open', now: 1000 });
    await store.createThread(thread);
    await store.createThread(other);
    await store.appendEvent({ threadId: thread.id, type: 'message.user', data: { text: 'one' } });
    await store.appendEvent({ threadId: thread.id, type: 'agent.result', data: { content: 'ok' } });
    const first = await service.pull(device.token, scope, []);
    assert.equal(first.threads.length, 1);
    assert.equal(first.threads[0].events, 2);
    assert.equal(first.threads[0].nextSeq, 2);
    await store.appendEvent({ threadId: thread.id, type: 'message.user', data: { text: 'two' } });
    const second = await service.pull(device.token, scope, first.cursors);
    assert.equal(second.threads[0].events, 1);
    assert.equal(second.threads[0].nextSeq, 3);
    await assert.rejects(() => service.pull('bad-token', scope, []), /authentication/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
