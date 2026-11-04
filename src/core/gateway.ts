import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createThreadRecord } from './runtime-schema.ts';
import type { RuntimeScope, ThreadRecord } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface AgentGatewayOptions {
  store: RuntimeStore;
  scope: RuntimeScope;
  host?: string;
  token?: string;
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
  private server: Server;
  private address: AgentGatewayAddress | null = null;

  constructor(opts: AgentGatewayOptions) {
    this.store = opts.store;
    this.scope = opts.scope;
    this.host = opts.host ?? '127.0.0.1';
    this.token = opts.token;
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
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    this.address = null;
  }

  private authorized(req: IncomingMessage): boolean {
    if (!this.token) return true;
    return req.headers.authorization === 'Bearer ' + this.token;
  }

  private async threadFor(id: string): Promise<ThreadRecord | null> {
    const thread = await this.store.getThread(id);
    if (!thread || !sameScope(thread.scope, this.scope)) return null;
    return thread;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!this.authorized(req)) { sendJson(res, 401, { error: 'unauthorized' }); return; }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname.replace(/\/$/, '');
      if (req.method === 'GET' && path === '/health') {
        sendJson(res, 200, { ok: true, service: 'weft-gateway' });
        return;
      }
      if (req.method === 'GET' && path === '/threads') {
        const threads = await this.store.listThreads(this.scope);
        sendJson(res, 200, { threads });
        return;
      }
      if (req.method === 'POST' && path === '/threads') {
        const body = await readJson(req);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) { sendJson(res, 400, { error: 'title is required' }); return; }
        const thread = createThreadRecord({ scope: this.scope, title, status: 'open' });
        await this.store.createThread(thread);
        const event = await this.store.appendEvent({ threadId: thread.id, type: 'thread.created', data: { title }, idempotencyKey: 'thread-create:' + thread.id });
        sendJson(res, 201, { thread, event });
        return;
      }
      const threadMatch = path.match(/^\/threads\/([^/]+)$/);
      if (req.method === 'GET' && threadMatch) {
        const thread = await this.threadFor(decodeURIComponent(threadMatch[1]));
        if (!thread) { sendJson(res, 404, { error: 'thread not found' }); return; }
        sendJson(res, 200, { thread });
        return;
      }
      const messagesMatch = path.match(/^\/threads\/([^/]+)\/messages$/);
      if (req.method === 'POST' && messagesMatch) {
        const thread = await this.threadFor(decodeURIComponent(messagesMatch[1]));
        if (!thread) { sendJson(res, 404, { error: 'thread not found' }); return; }
        const body = await readJson(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) { sendJson(res, 400, { error: 'text is required' }); return; }
        const key = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;
        const event = await this.store.appendEvent({ threadId: thread.id, type: 'message.user', data: { text }, idempotencyKey: key });
        const job = key ? undefined : await this.store.enqueueOutbox({ threadId: thread.id, topic: 'message.user', payload: { eventId: event.id } });
        sendJson(res, 202, { threadId: thread.id, event, jobId: job?.id ?? null });
        return;
      }
      const eventsMatch = path.match(/^\/threads\/([^/]+)\/events$/);
      if (req.method === 'GET' && eventsMatch) {
        const thread = await this.threadFor(decodeURIComponent(eventsMatch[1]));
        if (!thread) { sendJson(res, 404, { error: 'thread not found' }); return; }
        const after = Number(url.searchParams.get('after') ?? 0);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
        const events = await this.store.listEvents(thread.id, Number.isFinite(after) ? after : 0, limit);
        sendJson(res, 200, { threadId: thread.id, events });
        return;
      }
      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
