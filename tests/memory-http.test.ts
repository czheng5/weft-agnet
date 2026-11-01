import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpMemoryProvider } from '../src/core/memory-http.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(): MemoryRecord {
  const now = Date.now();
  return {
    id: 'mem-1',
    scope: { tenantId: 't1', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'preference',
    content: 'window seats',
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: ['evt-1'],
    createdAt: now,
    updatedAt: now
  };
}

test('HTTP MemoryHub write/search/get/forget/health', async () => {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init?.method ?? 'GET', headers, body: init?.body as string | undefined });
    if (url.endsWith('/health')) return new Response('{}', { status: 200 });
    if (url.endsWith('/memory/write')) return new Response(JSON.stringify({ receipts: [{ id: 'mem-1', version: 1, status: 'committed' }] }), { status: 200 });
    if (url.endsWith('/memory/search')) return new Response(JSON.stringify({ hits: [{ record: record(), score: 0.9, matchedBy: ['lexical'] }] }), { status: 200 });
    if (url.includes('/memory/mem-1')) return new Response(JSON.stringify({ record: record() }), { status: 200 });
    if (url.endsWith('/memory/forget')) return new Response(JSON.stringify({ accepted: 1, tombstoned: 1, propagation: 'complete' }), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  const provider = new HttpMemoryProvider({ baseUrl: 'https://hub.example/api/', token: 'secret', fetchImpl: fakeFetch });
  const scope = { tenantId: 't1', userId: 'u1', projectId: 'p1' };
  const receipts = await provider.write([record()]);
  assert.equal(receipts[0].status, 'committed');
  const hits = await provider.search({ text: 'window', scope, topK: 3 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].record.content, 'window seats');
  const got = await provider.get('mem-1', scope);
  assert.equal(got?.id, 'mem-1');
  const forgotten = await provider.forget({ scope, ids: ['mem-1'] });
  assert.equal(forgotten.propagation, 'complete');
  assert.equal((await provider.health()).ok, true);
  const writeCall = calls.find((c) => c.url.endsWith('/memory/write'));
  assert.ok(writeCall);
  assert.equal(writeCall!.headers['x-weft-tenant'], 't1');
  assert.equal(writeCall!.headers.authorization, 'Bearer secret');
  assert.match(writeCall!.body ?? '', /window seats/);
});

test('HTTP MemoryHub get returns null on 404', async () => {
  const provider = new HttpMemoryProvider({
    baseUrl: 'https://hub.example',
    fetchImpl: async () => new Response('no', { status: 404 })
  });
  assert.equal(await provider.get('missing', { tenantId: 't1' }), null);
});
