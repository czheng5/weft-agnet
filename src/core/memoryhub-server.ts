import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MemoryProvider, MemoryRecord, MemoryScope } from './memory.ts';
import type { MemoryHub } from './memory-hub.ts';

export interface MemoryHubServerOptions {
  provider: MemoryProvider | MemoryHub;
  token?: string;
  maxBodyBytes?: number;
}

export interface RunningMemoryHubServer {
  url: string;
  server: Server;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function scopeFrom(req: IncomingMessage): MemoryScope | null {
  const tenantId = String(req.headers['x-weft-tenant'] ?? '').trim();
  if (!tenantId) return null;
  return {
    tenantId,
    userId: String(req.headers['x-weft-user'] ?? '').trim() || undefined,
    projectId: String(req.headers['x-weft-project'] ?? '').trim() || undefined,
    sessionId: String(req.headers['x-weft-session'] ?? '').trim() || undefined
  };
}

export function createMemoryHubServer(opts: MemoryHubServerOptions): Server {
  const maxBodyBytes = opts.maxBodyBytes ?? 1024 * 1024;

  return createServer(async (req, res) => {
    try {
      if (opts.token) {
        const auth = String(req.headers.authorization ?? '');
        if (auth !== 'Bearer ' + opts.token) {
          json(res, 401, { error: 'unauthorized' });
          return;
        }
      }

      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, await opts.provider.health());
        return;
      }

      const scope = scopeFrom(req);
      if (!scope) {
        json(res, 400, { error: 'missing x-weft-tenant' });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/memory/write') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as { records?: MemoryRecord[]; relations?: unknown[] };
        if (!Array.isArray(body.records)) {
          json(res, 400, { error: 'records must be an array' });
          return;
        }
        for (const record of body.records) {
          if (record.scope.tenantId !== scope.tenantId) {
            json(res, 403, { error: 'tenant mismatch' });
            return;
          }
          record.scope = { ...record.scope, userId: scope.userId ?? record.scope.userId, projectId: scope.projectId ?? record.scope.projectId };
        }
        const hub = opts.provider as MemoryHub;
        const receipts = hub.relations
          ? await hub.write(body.records, (body.relations ?? []) as never)
          : await opts.provider.write(body.records);
        json(res, 200, { receipts });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/memory/search') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const hits = await opts.provider.search({
          text: String(body.text ?? ''),
          scope,
          topK: Number(body.topK ?? 5),
          layers: body.layers as never,
          kinds: body.kinds as never,
          minConfidence: body.minConfidence === undefined ? undefined : Number(body.minConfidence)
        });
        json(res, 200, { hits });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/memory/forget') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const receipt = await opts.provider.forget({
          scope,
          ids: body.ids as string[] | undefined,
          kind: body.kind as never,
          before: body.before === undefined ? undefined : Number(body.before),
          hard: Boolean(body.hard)
        });
        json(res, 200, receipt);
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/memory/')) {
        const id = decodeURIComponent(url.pathname.slice('/memory/'.length));
        const record = await opts.provider.get(id, scope);
        if (!record) {
          json(res, 404, { error: 'not found' });
          return;
        }
        json(res, 200, { record });
        return;
      }

      json(res, 404, { error: 'not found' });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function startMemoryHubServer(opts: MemoryHubServerOptions & { port?: number }): Promise<RunningMemoryHubServer> {
  const server = createMemoryHubServer(opts);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: 'http://127.0.0.1:' + address.port,
        server,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done()))
      });
    });
  });
}
