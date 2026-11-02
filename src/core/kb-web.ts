import type {
  KnowledgeBaseProvider,
  KnowledgeDoc,
  KnowledgeHit,
  KnowledgeQuery,
  KnowledgeScope,
  ProviderHealth
} from './kb.ts';

export interface WebKnowledgeBaseOptions {
  urls: string[];
  timeoutMs?: number;
  maxChars?: number;
  fetchImpl?: typeof fetch;
}

interface WebPage {
  url: string;
  title?: string;
  text: string;
  fetchedAt: number;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToText(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '')).trim() : undefined;
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
  return { title, text };
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/).filter((t) => t.length > 1);
}

export class WebKnowledgeBaseProvider implements KnowledgeBaseProvider {
  readonly id = 'web-kb';
  private readonly opts: Required<Omit<WebKnowledgeBaseOptions, 'fetchImpl'>> & { fetchImpl: typeof fetch };
  private readonly pages = new Map<string, WebPage>();

  constructor(opts: WebKnowledgeBaseOptions) {
    this.opts = {
      urls: [...new Set(opts.urls)].filter((url) => /^https?:\/\//i.test(url)),
      timeoutMs: opts.timeoutMs ?? 10000,
      maxChars: opts.maxChars ?? 20000,
      fetchImpl: opts.fetchImpl ?? fetch
    };
  }

  private async load(url: string): Promise<WebPage> {
    const cached = this.pages.get(url);
    if (cached) return cached;
    const response = await this.opts.fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(this.opts.timeoutMs)
    });
    if (!response.ok) throw new Error('web-kb HTTP ' + response.status + ' for ' + url);
    const html = await response.text();
    const extracted = htmlToText(html.slice(0, this.opts.maxChars));
    const page: WebPage = { url, title: extracted.title, text: extracted.text, fetchedAt: Date.now() };
    this.pages.set(url, page);
    return page;
  }

  async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
    const terms = tokenize(query.text);
    if (terms.length === 0) return [];
    const hits: KnowledgeHit[] = [];
    for (const url of this.opts.urls) {
      let page: WebPage;
      try {
        page = await this.load(url);
      } catch {
        continue;
      }
      const lower = page.text.toLowerCase();
      let score = 0;
      for (const term of terms) {
        let index = lower.indexOf(term);
        while (index >= 0) {
          score += 1;
          index = lower.indexOf(term, index + term.length);
        }
      }
      if (score === 0) continue;
      const first = lower.indexOf(terms[0]);
      const start = Math.max(0, first - 80);
      const snippet = page.text.slice(start, start + 260);
      hits.push({
        docId: url,
        title: page.title,
        snippet,
        score,
        source: url,
        updatedAt: page.fetchedAt,
        sensitivity: 'public',
        citation: url
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, query.topK ?? 5);
  }

  async get(docId: string, _scope: KnowledgeScope): Promise<KnowledgeDoc | null> {
    if (!this.opts.urls.includes(docId)) return null;
    try {
      const page = await this.load(docId);
      return {
        docId,
        title: page.title,
        content: page.text,
        source: docId,
        updatedAt: page.fetchedAt,
        metadata: { provider: this.id }
      };
    } catch {
      return null;
    }
  }

  async health(): Promise<ProviderHealth> {
    if (this.opts.urls.length === 0) return { ok: false, detail: 'no URLs configured' };
    try {
      const response = await this.opts.fetchImpl(this.opts.urls[0], {
        method: 'GET',
        signal: AbortSignal.timeout(this.opts.timeoutMs)
      });
      return { ok: response.ok, detail: 'http ' + response.status };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
