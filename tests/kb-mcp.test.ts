import test from 'node:test';
import assert from 'node:assert/strict';
import { McpKnowledgeBaseProvider, HttpMcpTransport } from '../src/core/kb-mcp.ts';

test('MCP KB search/get/health through transport', async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const transport = {
    async request(method: string, params?: unknown) {
      calls.push({ method, params });
      if (method === 'tools/call') {
        return { content: [{ type: 'text', text: JSON.stringify({ hits: [{ docId: 'mcp-1', snippet: 'mcp memory', score: 0.8, citation: 'mcp://mcp-1' }] }) }] };
      }
      if (method === 'resources/read') {
        return { contents: [{ uri: 'mcp://mcp-1', text: 'full mcp content', mimeType: 'text/plain' }] };
      }
      return {};
    }
  };
  const provider = new McpKnowledgeBaseProvider({ transport });
  const hits = await provider.search({ text: 'memory', scope: { tenantId: 't1' }, topK: 3 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].citation, 'mcp://mcp-1');
  const doc = await provider.get('mcp://mcp-1', { tenantId: 't1' });
  assert.match(doc?.content ?? '', /full mcp content/);
  assert.equal((await provider.health()).ok, true);
  assert.equal(calls[0].method, 'tools/call');
});

test('HTTP MCP transport sends JSON-RPC', async () => {
  let body = '';
  const transport = new HttpMcpTransport({
    endpoint: 'https://mcp.example/rpc',
    token: 'secret',
    fetchImpl: async (_input, init) => {
      body = String(init?.body ?? '');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }), { status: 200 });
    }
  });
  const result = await transport.request('ping');
  assert.deepEqual(result, { ok: true });
  assert.match(body, /"method":"ping"/);
});
