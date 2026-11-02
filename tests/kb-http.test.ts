import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpKnowledgeBaseProvider } from '../src/core/kb-http.ts';

test('HTTP KB search/get/health with scope headers', async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (url.includes('/search')) {
      return new Response(JSON.stringify({
        hits: [{ docId: 'doc-1', title: 'Memory', snippet: 'MemoryHub', score: 0.9, citation: 'kb://doc-1' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/docs/')) {
      return new Response(JSON.stringify({ docId: 'doc-1', content: 'full', source: 'kb://doc-1' }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  const kb = new HttpKnowledgeBaseProvider({ baseUrl: 'https://kb.example/api/', token: 'secret', fetchImpl: fakeFetch });
  const scope = { tenantId: 't1', userId: 'u1', projectId: 'p1' };
  const hits = await kb.search({ text: 'memory', scope, topK: 3 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].citation, 'kb://doc-1');
  assert.equal(hits[0].snippet, 'MemoryHub');
  const searchCall = calls.find((c) => c.url.includes('/search'));
  assert.ok(searchCall);
  assert.match(searchCall!.url, /q=memory/);
  assert.match(searchCall!.url, /topK=3/);
  assert.equal(searchCall!.headers['x-weft-tenant'], 't1');
  assert.equal(searchCall!.headers.authorization, 'Bearer secret');
  const doc = await kb.get('doc-1', scope);
  assert.equal(doc?.content, 'full');
  const health = await kb.health();
  assert.equal(health.ok, true);
});

test('HTTP KB returns null on 404 doc', async () => {
  const fakeFetch = async (): Promise<Response> => new Response('no', { status: 404 });
  const kb = new HttpKnowledgeBaseProvider({ baseUrl: 'https://kb.example', fetchImpl: fakeFetch });
  assert.equal(await kb.get('missing', { tenantId: 't1' }), null);
});
