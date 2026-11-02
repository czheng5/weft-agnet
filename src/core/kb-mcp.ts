import type {
  KnowledgeBaseProvider,
  KnowledgeDoc,
  KnowledgeHit,
  KnowledgeQuery,
  KnowledgeScope,
  ProviderHealth
} from './kb.ts';

export interface McpTransport {
  request(method: string, params?: unknown): Promise<unknown>;
}

export interface McpKnowledgeBaseOptions {
  transport: McpTransport;
  searchTool?: string;
  resourceRead?: boolean;
}

export interface HttpMcpTransportOptions {
  endpoint: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function payloadOf(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const value = result as Record<string, unknown>;
  if (value.structuredContent && typeof value.structuredContent === 'object') {
    return value.structuredContent as Record<string, unknown>;
  }
  if (Array.isArray(value.content)) {
    for (const item of value.content) {
      if (item && typeof item === 'object' && (item as { type?: string }).type === 'text') {
        const text = String((item as { text?: string }).text ?? '');
        try {
          return JSON.parse(text) as Record<string, unknown>;
        } catch {
          return { text };
        }
      }
    }
  }
  return value;
}

export class HttpMcpTransport implements McpTransport {
  private readonly opts: Required<Omit<HttpMcpTransportOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };
  private nextId = 1;

  constructor(opts: HttpMcpTransportOptions) {
    this.opts = {
      endpoint: opts.endpoint,
      token: opts.token ?? '',
      timeoutMs: opts.timeoutMs ?? 10000,
      fetchImpl: opts.fetchImpl ?? fetch
    };
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    if (this.opts.token) headers.authorization = 'Bearer ' + this.opts.token;
    const response = await this.opts.fetchImpl(this.opts.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(this.opts.timeoutMs)
    });
    if (!response.ok) throw new Error('mcp HTTP ' + response.status);
    const json = await response.json() as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error('mcp error: ' + (json.error.message ?? 'unknown'));
    return json.result;
  }
}

export class McpKnowledgeBaseProvider implements KnowledgeBaseProvider {
  readonly id = 'mcp-kb';
  private readonly transport: McpTransport;
  private readonly searchTool: string;
  private readonly resourceRead: boolean;

  constructor(opts: McpKnowledgeBaseOptions) {
    this.transport = opts.transport;
    this.searchTool = opts.searchTool ?? 'kb_search';
    this.resourceRead = opts.resourceRead ?? true;
  }

  async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
    const result = await this.transport.request('tools/call', {
      name: this.searchTool,
      arguments: { query: query.text, topK: query.topK ?? 5, scope: query.scope, filters: query.filters }
    });
    const payload = payloadOf(result);
    const raw = Array.isArray(payload.hits) ? payload.hits : Array.isArray(payload.results) ? payload.results : [];
    return raw.slice(0, query.topK ?? 5).map((item) => {
      const hit = item as Record<string, unknown>;
      const source = String(hit.source ?? hit.url ?? hit.docId ?? 'mcp');
      return {
        docId: String(hit.docId ?? hit.id ?? source),
        title: hit.title ? String(hit.title) : undefined,
        snippet: String(hit.snippet ?? hit.text ?? ''),
        score: Number(hit.score ?? 0),
        source,
        updatedAt: hit.updatedAt ? Number(hit.updatedAt) : undefined,
        sensitivity: hit.sensitivity as KnowledgeHit['sensitivity'],
        citation: String(hit.citation ?? source)
      };
    });
  }

  async get(docId: string, _scope: KnowledgeScope): Promise<KnowledgeDoc | null> {
    if (!this.resourceRead) return null;
    const result = await this.transport.request('resources/read', { uri: docId });
    if (!result || typeof result !== 'object') return null;
    const contents = (result as { contents?: Array<{ uri?: string; text?: string; mimeType?: string }> }).contents;
    const first = contents?.[0];
    if (!first) return null;
    return {
      docId,
      title: first.uri,
      content: String(first.text ?? ''),
      source: String(first.uri ?? docId),
      metadata: { mimeType: first.mimeType }
    };
  }

  async health(): Promise<ProviderHealth> {
    try {
      await this.transport.request('ping');
      return { ok: true, detail: 'mcp' };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
