import test from 'node:test';
import assert from 'node:assert/strict';
import { WebKnowledgeBaseProvider, htmlToText } from '../src/core/kb-web.ts';

test('web KB strips HTML and returns citations', async () => {
  const html = '<html><head><title>Weft Docs</title><script>evil()</script></head><body><h1>Memory</h1><p>MemoryHub knowledge base</p></body></html>';
  const provider = new WebKnowledgeBaseProvider({
    urls: ['https://example.test/doc'],
    fetchImpl: async () => new Response(html, { status: 200 })
  });
  const hits = await provider.search({ text: 'MemoryHub', scope: { tenantId: 't1' } });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].citation, 'https://example.test/doc');
  assert.match(hits[0].snippet, /MemoryHub/);
  const doc = await provider.get('https://example.test/doc', { tenantId: 't1' });
  assert.match(doc?.content ?? '', /MemoryHub knowledge/);
  assert.equal(await provider.get('https://other.test/doc', { tenantId: 't1' }), null);
  assert.equal((await provider.health()).ok, true);
});

test('htmlToText removes scripts and decodes entities', () => {
  const out = htmlToText('<title>A &amp; B</title><style>x</style><p>hello&nbsp;world</p>');
  assert.equal(out.title, 'A & B');
  assert.match(out.text, /hello world/);
  assert.doesNotMatch(out.text, /style/);
});
