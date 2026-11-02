import type { MemoryProvider, MemoryRecord, MemoryScope } from './memory.ts';

export interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const TOOLS = [
  {
    name: 'memory_search',
    description: 'Search scoped memory',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, topK: { type: 'number' } }, required: ['text'] }
  },
  {
    name: 'memory_write',
    description: 'Write memory records',
    inputSchema: { type: 'object', properties: { records: { type: 'array' } }, required: ['records'] }
  },
  {
    name: 'memory_get',
    description: 'Get a memory record by id',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  }
];

function error(id: string | number | null, code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function handleMemoryMcp(provider: MemoryProvider, request: McpRequest, scope: MemoryScope | null): Promise<McpResponse> {
  const id = request.id ?? null;
  if (request.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'weft-memoryhub', version: '0.1.0' },
        capabilities: { tools: {} }
      }
    };
  }
  if (request.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (request.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (request.method !== 'tools/call') return error(id, -32601, 'method not found');
  if (!scope) return error(id, -32000, 'missing tenant scope');

  const params = (request.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
  const args = params.arguments ?? {};
  if (params.name === 'memory_search') {
    const hits = await provider.search({
      text: String(args.text ?? ''),
      scope,
      topK: Number(args.topK ?? 5)
    });
    const result = { hits };
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } };
  }
  if (params.name === 'memory_get') {
    const record = await provider.get(String(args.id ?? ''), scope);
    const result = { record };
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } };
  }
  if (params.name === 'memory_write') {
    const records = args.records as MemoryRecord[] | undefined;
    if (!Array.isArray(records)) return error(id, -32602, 'records must be an array');
    for (const record of records) record.scope = { ...record.scope, tenantId: scope.tenantId, userId: scope.userId ?? record.scope.userId, projectId: scope.projectId ?? record.scope.projectId };
    const receipts = await provider.write(records);
    const result = { receipts };
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } };
  }
  return error(id, -32602, 'unknown tool');
}
