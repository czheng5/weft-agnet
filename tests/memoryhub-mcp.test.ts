import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { handleMemoryMcp } from '../src/core/memoryhub-mcp.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function record(): MemoryRecord {
  const now = Date.now();
  return {
    id: 'mcp-1',
    scope: { tenantId: 't1', userId: 'u1', projectId: 'p1' },
    layer: 'semantic',
    kind: 'fact',
    content: 'mcp memory',
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: [],
    createdAt: now,
    updatedAt: now
  };
}

test('MemoryHub MCP initialize/tools/list/tools/call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-mcp-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  const scope = { tenantId: 't1', userId: 'u1', projectId: 'p1' };
  try {
    const init = await handleMemoryMcp(provider, { jsonrpc: '2.0', id: 1, method: 'initialize' }, null);
    assert.equal((init.result as { serverInfo: { name: string } }).serverInfo.name, 'weft-memoryhub');
    const list = await handleMemoryMcp(provider, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, null);
    assert.equal((list.result as { tools: unknown[] }).tools.length, 3);
    await handleMemoryMcp(provider, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'memory_write', arguments: { records: [record()] } }
    }, scope);
    const search = await handleMemoryMcp(provider, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'memory_search', arguments: { text: 'mcp' } }
    }, scope);
    const structured = (search.result as { structuredContent: { hits: unknown[] } }).structuredContent;
    assert.equal(structured.hits.length, 1);
  } finally {
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
