export interface JwksCacheOptions {
  url: string;
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  minRefreshMs?: number;
  now?: () => number;
}

export class JwksError extends Error {
  constructor(message: string) {
    super('jwks: ' + message);
    this.name = 'JwksError';
  }
}

export class JwksCache {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly ttlMs: number;
  private readonly minRefreshMs: number;
  private readonly clock: () => number;
  private keys: Record<string, unknown>[] = [];
  private fetchedAt = 0;
  private inFlight: Promise<Record<string, unknown>[]> | null = null;

  constructor(opts: JwksCacheOptions) {
    if (!/^https?:\/\//.test(opts.url)) throw new JwksError('url must be http(s)');
    this.url = opts.url;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.ttlMs = opts.ttlMs ?? 300_000;
    this.minRefreshMs = opts.minRefreshMs ?? 5_000;
    this.clock = opts.now ?? Date.now;
  }

  async getKeys(force = false): Promise<Record<string, unknown>[]> {
    const fresh = this.fetchedAt > 0 && this.clock() - this.fetchedAt < this.ttlMs;
    if (!force && fresh) return this.keys;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.fetchKeys();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  async refresh(): Promise<Record<string, unknown>[]> {
    return this.getKeys(true);
  }

  async getKey(kid: string): Promise<Record<string, unknown>> {
    let keys = await this.getKeys();
    let found = keys.find((key) => key.kid === kid);
    if (!found) {
      if (this.clock() - this.fetchedAt < this.minRefreshMs) throw new JwksError('unknown kid; refresh throttled');
      keys = await this.refresh();
      found = keys.find((key) => key.kid === kid);
    }
    if (!found) throw new JwksError('unknown kid');
    return found;
  }

  cacheAgeMs(): number {
    return this.fetchedAt === 0 ? Infinity : this.clock() - this.fetchedAt;
  }

  private async fetchKeys(): Promise<Record<string, unknown>[]> {
    const response = await this.fetchImpl(this.url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new JwksError('HTTP ' + response.status);
    const payload = await response.json() as unknown;
    const list = payload && typeof payload === 'object' && Array.isArray((payload as { keys?: unknown }).keys)
      ? (payload as { keys: unknown[] }).keys
      : [];
    const keys = list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
    if (keys.length === 0) throw new JwksError('empty key set');
    this.keys = keys;
    this.fetchedAt = this.clock();
    return keys;
  }
}
