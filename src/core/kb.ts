import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export interface KnowledgeScope {
  tenantId: string;
  userId?: string;
  projectId?: string;
}

export interface KnowledgeQuery {
  text: string;
  scope: KnowledgeScope;
  topK?: number;
  filters?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

export interface KnowledgeHit {
  docId: string;
  title?: string;
  snippet: string;
  score: number;
  source: string;
  updatedAt?: number;
  sensitivity?: 'public' | 'internal' | 'private' | 'secret';
  citation: string;
}

export interface KnowledgeDoc {
  docId: string;
  title?: string;
  content: string;
  source: string;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealth {
  ok: boolean;
  detail?: string;
}

export interface KnowledgeBaseProvider {
  readonly id: string;
  search(query: KnowledgeQuery): Promise<KnowledgeHit[]>;
  get(docId: string, scope: KnowledgeScope): Promise<KnowledgeDoc | null>;
  health(): Promise<ProviderHealth>;
}

function walk(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git' || name === '.weft') continue;
      out.push(...walk(full));
    } else if (/\.(md|txt)$/i.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/).filter((t) => t.length > 1);
}

export class LocalDocsProvider implements KnowledgeBaseProvider {
  readonly id = 'local-docs';
  readonly roots: string[];

  constructor(roots: string[]) {
    this.roots = roots.map((r) => resolve(r));
  }

  async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
    const terms = tokenize(query.text);
    const hits: KnowledgeHit[] = [];
    for (const root of this.roots) {
      for (const file of walk(root)) {
        const content = readFileSync(file, 'utf8');
        const lower = content.toLowerCase();
        let score = 0;
        for (const term of terms) {
          let index = lower.indexOf(term);
          while (index >= 0) {
            score += 1;
            index = lower.indexOf(term, index + term.length);
          }
        }
        if (score === 0) continue;
        const first = lower.indexOf(terms[0] ?? '');
        const start = Math.max(0, first - 80);
        const snippet = content.slice(start, start + 260).replace(/\s+/g, ' ').trim();
        const rel = relative(root, file).replace(/\\/g, '/');
        hits.push({
          docId: file,
          title: rel,
          snippet,
          score,
          source: 'file:///' + file.replace(/\\/g, '/'),
          updatedAt: statSync(file).mtimeMs,
          sensitivity: 'internal',
          citation: rel
        });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, query.topK ?? 5);
  }

  async get(docId: string): Promise<KnowledgeDoc | null> {
    const file = resolve(docId);
    if (!existsSync(file)) return null;
    const roots = this.roots.map((r) => r.toLowerCase());
    if (!roots.some((root) => file.toLowerCase().startsWith(root))) return null;
    const content = readFileSync(file, 'utf8');
    return {
      docId: file,
      title: relative(resolve('.'), file).replace(/\\/g, '/'),
      content,
      source: 'file:///' + file.replace(/\\/g, '/'),
      updatedAt: statSync(file).mtimeMs,
      metadata: { provider: this.id }
    };
  }

  async health(): Promise<ProviderHealth> {
    return { ok: true, detail: 'local-docs roots=' + this.roots.length };
  }
}
