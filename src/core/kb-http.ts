import type {
  KnowledgeBaseProvider,
  KnowledgeDoc,
  KnowledgeHit,
  KnowledgeQuery,
  KnowledgeScope,
  ProviderHealth
} from './kb.ts';

export interface HttpKnowledgeBaseOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface HttpHit {
  docId?: string;
  title?: string;
  snippet?: string;
  score?: number;
  source?: string;
  updatedAt?: number;
  sensitivity?: 'public' | 'internal' | 'private' | 'secret';
  citation?: string;
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, '') + path;
}

function scopeHeaders(scope: KnowledgeScope): Record<string, string> {
  return {
    'x-weft-tenant': scope.tenantId,
    'x-weft-user': scope.userId ?? '',
    'x-weft-project': scope.projectId ?? ''
  };
}

export class HttpKnowledgeBaseProvider implements KnowledgeBaseProvider {
  readonly id = 'http-kb';
  private readonly opts: Required<Omit<HttpKnowledgeBaseOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };

  constructor(opts: HttpKnowledgeBaseOptions) {
    this.opts = {
      baseUrl: opts.baseUrl,
      token: opts.token ?? '',
      timeoutMs: opts.timeoutMs ?? 10000,
      fetchImpl: opts.fetchImpl ?? fetch
    };
  }

  private headers(scope: KnowledgeScope): Record<string, string> {
    const headers: Record<string, string> = { accept: 'application/json', ...scopeHeaders(scope) };
    if (this.opts.token) headers.authorization = 'Bearer ' + this.opts.token;
    return headers;
  }

  async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
    const url = new URL(joinUrl(this.opts.baseUrl, '/search'));
    url.searchParams.set('q', query.text);
    url.searchParams.set('topK', String(query.topK ?? 5));
    const response = await this.opts.fetchImpl(url, {
      method: 'GET',
      headers: this.headers(query.scope),
      signal: AbortSignal.timeout(this.opts.timeoutMs)
    });
    if (!response.ok) throw new Error('http-kb search HTTP ' + response.status);
    const json = await response.json() as { hits?: HttpHit[] };
    const hits = Array.isArray(json.hits) ? json.hits : [];
    return hits.map((hit) => ({
      docId: String(hit.docId ?? ''),
      title: hit.title,
      snippet: String(hit.snippet ?? ''),
      score: Number(hit.score ?? 0),
      source: String(hit.source ?? this.opts.baseUrl),
      updatedAt: hit.updatedAt,
      sensitivity: hit.sensitivity,
      citation: String(hit.citation ?? hit.source ?? this.opts.baseUrl)
    }));
  }

  async get(docId: string, scope: KnowledgeScope): Promise<KnowledgeDoc | null> {
    const url = joinUrl(this.opts.baseUrl, '/docs/' + encodeURIComponent(docId));
    const response = await this.opts.fetchImpl(url, {
      method: 'GET',
      headers: this.headers(scope),
      signal: AbortSignal.timeout(this.opts.timeoutMs)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('http-kb get HTTP ' + response.status);
    const json = await response.json() as {
      docId?: string;
      title?: string;
      content?: string;
      source?: string;
      updatedAt?: number;
      metadata?: Record<string, unknown>;
    };
    return {
      docId: String(json.docId ?? docId),
      title: json.title,
      content: String(json.content ?? ''),
      source: String(json.source ?? this.opts.baseUrl),
      updatedAt: json.updatedAt,
      metadata: json.metadata
    };
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
