export interface HttpSourceItem {
  id: string;
  text: string;
  title?: string;
  raw?: unknown;
}

export interface HttpSourceOptions {
  url: string;
  handler: (item: HttpSourceItem) => Promise<void> | void;
  intervalMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  onError?: (error: unknown) => void;
}

function itemsFromPayload(payload: unknown): HttpSourceItem[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  const out: HttpSourceItem[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { id?: unknown; text?: unknown; title?: unknown };
    if (typeof item.id !== 'string' || !item.id.trim()) continue;
    if (typeof item.text !== 'string' || !item.text.trim()) continue;
    out.push({ id: item.id, text: item.text, title: typeof item.title === 'string' ? item.title : undefined, raw });
  }
  return out;
}

export class HttpSource {
  readonly url: string;
  private readonly handler: HttpSourceOptions['handler'];
  private readonly intervalMs: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly onError?: (error: unknown) => void;
  private readonly seen = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(opts: HttpSourceOptions) {
    this.url = opts.url;
    this.handler = opts.handler;
    this.intervalMs = opts.intervalMs ?? 30_000;
    this.headers = opts.headers ?? {};
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.onError = opts.onError;
  }

  async pollOnce(): Promise<number> {
    const response = await this.fetchImpl(this.url, { headers: { accept: 'application/json', ...this.headers } });
    if (!response.ok) throw new Error('source returned HTTP ' + response.status);
    const payload = await response.json() as unknown;
    let handled = 0;
    for (const item of itemsFromPayload(payload)) {
      if (this.seen.has(item.id)) continue;
      await this.handler(item);
      this.seen.add(item.id);
      handled += 1;
    }
    return handled;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.pollOnce().catch((error) => this.onError?.(error));
    }, this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  isRunning(): boolean {
    return this.running;
  }
}
