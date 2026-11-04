import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import { Router } from '../src/core/router.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 'gateway-t', projectId: 'gateway-p', workspaceId: 'gateway-w' };

test('agent gateway streams events over SSE', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-gateway-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'), { now: () => 1000 });
  const gateway = new AgentGateway({ store, scope, router: new Router({ store, now: () => 1000 }) });
  const controller = new AbortController();
  try {
    const address = await gateway.start(0);
    const base = address.url;
    const created = await fetch(base + '/threads', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'sse' })
    });
    const threadId = ((await created.json()) as { thread: { id: string } }).thread.id;
    await fetch(base + '/threads/' + threadId + '/messages', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'stream me' })
    });

    const response = await fetch(base + '/threads/' + threadId + '/events/stream?after=1', { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = response.body!.getReader();
    let text = '';
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && !text.includes('message.user')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    assert.match(text, /event: message.user/);
    assert.match(text, /stream me/);
    try { await reader.cancel(); } catch { /* stream already aborted */ }
  } finally {
    controller.abort();
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
