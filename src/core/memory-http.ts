import type {
  ForgetReceipt,
  ForgetSelector,
  MemoryHit,
  MemoryProvider,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  ProviderHealth,
  WriteReceipt
} from './memory.ts';

export interface HttpMemoryOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, '') + path;
}

function scopeHeaders(scope: MemoryScope): Record<string, string> {
  return {
    'x-weft-tenant': scope.tenantId,
    'x-weft-user': scope.userId ?? '',
    'x-weft-project': scope.projectId ?? '',
    'x-weft-session': scope.sessionId ?? ''
  };
}

export class HttpMemoryProvider implements MemoryProvider {
  readonly id = 'http-memory';
  private readonly opts: Required<Omit<HttpMemoryOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(opts: HttpMemoryOptions) {
    this.opts = {
      baseUrl: opts.baseUrl,
      token: opts.token ?? '',
      timeoutMs: opts.timeoutMs ?? 10000,
      fetchImpl: opts.fetchImpl ?? fetch
    };
  }

  private headers(scope: MemoryScope): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', ...scopeHeaders(scope) };
    if (this.opts.token) headers.authorization = 'Bearer ' + this.opts.token;
    return headers;
  }

  private async request(path: string, scope: MemoryScope, init: RequestInit): Promise<Response> {
    return this.opts.fetchImpl(joinUrl(this.opts.baseUrl, path), {
      ...init,
      headers: { ...this.headers(scope), ...(init.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(this.opts.timeoutMs)
    });
  }

  async write(records: MemoryRecord[]): Promise<WriteReceipt[]> {
    const scope = records[0]?.scope ?? { tenantId: '' };
    const response = await this.request('/memory/write', scope, {
      method: 'POST',
      body: JSON.stringify({ records })
    });
    if (!response.ok) throw new Error('http-memory write HTTP ' + response.status);
    const json = await response.json() as { receipts?: WriteReceipt[] };
    if (!Array.isArray(json.receipts)) throw new Error('http-memory write: missing receipts');
    return json.receipts;
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const response = await this.request('/memory/search', query.scope, {
      method: 'POST',
      body: JSON.stringify(query)
    });
    if (!response.ok) throw new Error('http-memory search HTTP ' + response.status);
    const json = await response.json() as { hits?: MemoryHit[] };
    return Array.isArray(json.hits) ? json.hits : [];
  }

  async get(id: string, scope: MemoryScope): Promise<MemoryRecord | null> {
    const response = await this.request('/memory/' + encodeURIComponent(id), scope, { method: 'GET' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('http-memory get HTTP ' + response.status);
    const json = await response.json() as { record?: MemoryRecord } | MemoryRecord;
    return 'record' in json && json.record ? json.record : json as MemoryRecord;
  }

  async forget(selector: ForgetSelector): Promise<ForgetReceipt> {
    const response = await this.request('/memory/forget', selector.scope, {
      method: 'POST',
      body: JSON.stringify(selector)
    });
    if (!response.ok) throw new Error('http-memory forget HTTP ' + response.status);
    return await response.json() as ForgetReceipt;
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.opts.fetchImpl(joinUrl(this.opts.baseUrl, '/health'), {
        method: 'GET',
        signal: AbortSignal.timeout(this.opts.timeoutMs)
      });
      return { ok: response.ok, detail: 'http ' + response.status };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
