import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createThreadRecord, validateCapabilityManifest, RuntimeSchemaError } from './runtime-schema.ts';
import { Router } from './router.ts';
import { SURFACE_HTML } from './surface.ts';
import { AccessError, assertRole, resolvePrincipal } from './access.ts';
import type { Principal, QuotaPolicy } from './access.ts';
import type { RuntimeScope, ThreadRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface AgentGatewayOptions {
  store: RuntimeStore;
  scope: RuntimeScope;
  host?: string;
  token?: string;
  router?: Router;
  principals?: Principal[];
  quota?: QuotaPolicy;
}

export interface AgentGatewayAddress {
  host: string;
  port: number;
  url: string;
}

const MAX_BODY = 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
  res.end(html);
}

function sameScope(a: RuntimeScope, b: RuntimeScope): boolean {
  return a.tenantId === b.tenantId && a.projectId === b.projectId && a.workspaceId === b.workspaceId;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>); }
      catch { reject(new Error('invalid json body')); }
    });
    req.on('error', reject);
  });
}

export class AgentGateway {
  readonly store: RuntimeStore;
  readonly scope: RuntimeScope;
  readonly host: string;
  readonly token?: string;
  private readonly router: Router;
  private readonly principals?: Principal[];
  private readonly defaultPrincipal: Principal;
  private readonly quota: QuotaPolicy;
  private readonly streams = new Set<ServerResponse>();
  private server: Server;
  private address: AgentGatewayAddress | null = null;

  constructor(opts: AgentGatewayOptions) {
    this.store = opts.store;
    this.scope = opts.scope;
    this.host = opts.host ?? '127.0.0.1';
    this.token = opts.token;
    this.router = opts.router ?? new Router({ store: this.store });
    this.principals = opts.principals;
    this.defaultPrincipal = { id: 'local', token: opts.token ?? '', role: 'admin', scope: opts.scope };
    this.quota = opts.quota ?? {};
    this.server = createServer((req, res) => { void this.handle(req, res); });
  }

  async start(port = 0): Promise<AgentGatewayAddress> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, this.host, () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('gateway has no TCP address');
    this.address = { host: this.host, port: address.port, url: 'http://' + this.host + ':' + address.port };
    return this.address;
  }

  async close(): Promise<void> {
    for (const stream of this.streams) stream.end();
    this.streams.clear();
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    this.address = null;
  }

  private principalFor(req: IncomingMessage): Principal | null {
    if (this.principals) return resolvePrincipal(this.principals, req.headers.authorization);
    if (this.token) return req.headers.authorization === 'Bearer ' + this.token ? this.defaultPrincipal : null;
    return this.defaultPrincipal;
  }

  private async threadFor(id: string, scope = this.scope): Promise<ThreadRecord | null> {
    const thread = await this.store.getThread(id);
    if (!thread || !sameScope(thread.scope, scope)) return null;
    return thread;
  }

  private async enforceThreadQuota(scope: RuntimeScope): Promise<void> {
    if (this.quota.maxThreads === undefined) return;
    const count = (await this.store.listThreads(scope)).length;
    if (count >= this.quota.maxThreads) throw new AccessError(429, 'tenant thread quota exceeded');
  }

  private async enforceMessageQuota(thread: ThreadRecord): Promise<void> {
    if (this.quota.maxMessagesPerThread === undefined) return;
    const count = (await this.store.listEvents(thread.id, 0, 100000)).filter((event) => event.type === 'message.user').length;
    if (count >= this.quota.maxMessagesPerThread) throw new AccessError(429, 'thread message quota exceeded');
  }

  private async streamEvents(thread: ThreadRecord, url: URL, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const after = Number(url.searchParams.get('after') ?? 0);
    let lastSeq = Number.isFinite(after) ? after : 0;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    res.write(': connected\n\n');
    this.streams.add(res);
    let closed = false;
    const cleanup = (): void => { closed = true; clearInterval(poll); clearInterval(ping); this.streams.delete(res); };
    const poll = setInterval(() => {
      void this.store.listEvents(thread.id, lastSeq, 100).then((events) => {
        if (closed) return;
        for (const event of events) {
          if (event.seq <= lastSeq) continue;
          lastSeq = event.seq;
          res.write('id: ' + event.seq + '\nevent: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n');
        }
      }).catch(() => undefined);
    }, 500);
    const ping = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 15_000);
    req.on('close', cleanup);
    res.on('close', cleanup);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const principal = this.principalFor(req);
      if (!principal) { sendJson(res, 401, { error: 'unauthorized' }); return; }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname.replace(/\/$/, '');
      if (req.method === 'GET' && path === '') {
        sendHtml(res, 200, SURFACE_HTML);
        return;
      }
      if (req.method === 'GET' && path === '/health') {
        sendJson(res, 200, { ok: true, service: 'weft-gateway' });
        return;
      }
      if (req.method === 'GET' && path === '/capabilities') {
        sendJson(res, 200, { capabilities: await this.store.listCapabilities() });
        return;
      }
      if (req.method === 'POST' && path === '/capabilities') {
        assertRole(principal, 'admin');
        const body = await readJson(req);
        try {
          const manifest = validateCapabilityManifest(body.manifest ?? body);
          await this.store.putCapability(manifest);
          sendJson(res, 201, { capability: manifest });
        } catch (error) {
          if (error instanceof RuntimeSchemaError) { sendJson(res, 400, { error: error.message }); return; }
          throw error;
        }
        return;
      }
      const capabilityMatch = path.match(/^\/capabilities\/([^/]+)\/([^/]+)$/);
      if (req.method === 'GET' && capabilityMatch) {
        const selector = decodeURIComponent(capabilityMatch[1]);
        const version = decodeURIComponent(capabilityMatch[2]);
        const capability = (await this.store.getCapability(selector, version)) ?? (await this.store.listCapabilities()).find((item) => item.id === selector && item.version === version);
        if (!capability) { sendJson(res, 404, { error: 'capability not found' }); return; }
        sendJson(res, 200, { capability });
        return;
      }
      if (req.method === 'GET' && path === '/threads') {
        const threads = await this.store.listThreads(principal.scope);
        sendJson(res, 200, { threads });
        return;
      }
      if (req.method === 'POST' && path === '/threads') {
        assertRole(principal, 'writer');
        await this.enforceThreadQuota(principal.scope);
        const body = await readJson(req);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) { sendJson(res, 400, { error: 'title is required' }); return; }
        const thread = createThreadRecord({ scope: principal.scope, title, status: 'open' });
        await this.store.createThread(thread);
        const event = await this.store.appendEvent({ threadId: thread.id, type: 'thread.created', data: { title }, idempotencyKey: 'thread-create:' + thread.id });
        sendJson(res, 201, { thread, event });
        return;
      }
      const threadMatch = path.match(/^\/threads\/([^/]+)$/);
      if (req.method === 'GET' && threadMatch) {
        const thread = await this.threadFor(decodeURIComponent(threadMatch[1]), principal.scope);
        if (!thread) { sendJson(res, 404, { error: 'thread not found' }); return; }
        sendJson(res, 200, { thread });
        return;
      }
      const messagesMatch = path.match(/^\/threads\/([^/]+)\/messages$/);
      if (req.method === 'POST' && messagesMatch) {
        assertRole(principal, 'writer');
        const thread = await this.threadFor(decodeURIComponent(messagesMatch[1]), principal.scope);
        if (!thread) { sendJson(res, 404, { error: 'thread not found' }); return; }
        await this.enforceMessageQuota(thread);
        const body = await readJson(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) { sendJson(res, 400, { error: 'text is required' }); return; }
        const key = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;
        const result = await this.router.route(thread, text, { idempotencyKey: key });
        if (!result.accepted) { sendJson(res, 403, { error: result.reason }); return; }
        sendJson(res, 202, { threadId: thread.id, event: result.event, jobId: result.job?.id ?? null });
        return;
      }
      const streamMatch = path.match(/^\/threads\/([^/]+)\/events\/stream$/);
      if (req.method === 'GET' && streamMatch) {
        const thread = await this.threadFor(decodeURIComponent(streamMatch[1]), principal.scope);
        if (!thread) { sendJson(res, 404, { error: 'thread not found' }); return; }
        await this.streamEvents(thread, url, req, res);
        return;
      }
      const eventsMatch = path.match(/^\/threads\/([^/]+)\/events$/);
      if (req.method === 'GET' && eventsMatch) {
        const thread = await this.threadFor(decodeURIComponent(eventsMatch[1]), principal.scope);
        if (!thread) { sendJson(res, 404, { error: 'thread not found' }); return; }
        const after = Number(url.searchParams.get('after') ?? 0);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
        const events = await this.store.listEvents(thread.id, Number.isFinite(after) ? after : 0, limit);
        sendJson(res, 200, { threadId: thread.id, events });
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      const status = error instanceof AccessError ? error.status : 500;
      sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
