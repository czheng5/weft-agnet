import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RuntimeScope } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface DeviceRecord {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  revokedAt?: number;
}

interface DeviceStoreJSON {
  version: 1;
  devices: DeviceRecord[];
}

export class DeviceRegistry {
  readonly path: string;
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly clock: () => number;

  constructor(path: string, now: () => number = Date.now) {
    this.path = path;
    this.clock = now;
    this.load();
  }

  register(name: string): { device: DeviceRecord; token: string } {
    if (!name.trim()) throw new Error('device name is required');
    const token = randomBytes(32).toString('base64url');
    const device: DeviceRecord = {
      id: 'device-' + randomBytes(8).toString('hex'),
      name,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      createdAt: this.clock(),
      lastSeenAt: this.clock()
    };
    this.devices.set(device.id, device);
    this.persist();
    return { device: { ...device }, token };
  }

  authenticate(token: string): DeviceRecord | null {
    const hash = createHash('sha256').update(token).digest();
    for (const device of this.devices.values()) {
      if (device.revokedAt !== undefined) continue;
      const known = Buffer.from(device.tokenHash, 'hex');
      if (known.length === hash.length && timingSafeEqual(known, hash)) {
        device.lastSeenAt = this.clock();
        this.persist();
        return { ...device };
      }
    }
    return null;
  }

  revoke(id: string): boolean {
    const device = this.devices.get(id);
    if (!device) return false;
    device.revokedAt = this.clock();
    this.persist();
    return true;
  }

  list(): DeviceRecord[] {
    return [...this.devices.values()].map((device) => ({ ...device }));
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as DeviceStoreJSON;
      if (raw.version !== 1 || !Array.isArray(raw.devices)) return;
      for (const device of raw.devices) {
        if (typeof device.id === 'string' && typeof device.tokenHash === 'string') this.devices.set(device.id, device);
      }
    } catch {
      // absent or malformed starts empty
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify({ version: 1, devices: this.list() }, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}

export interface SyncCursor {
  threadId: string;
  afterSeq: number;
}

export interface SyncThread {
  threadId: string;
  title: string;
  status: string;
  version: number;
  events: number;
  nextSeq: number;
}

export interface SyncBatch {
  deviceId: string;
  threads: SyncThread[];
  cursors: SyncCursor[];
  serverTime: number;
}

export class DeviceSyncService {
  private readonly store: RuntimeStore;
  private readonly devices: DeviceRegistry;
  private readonly clock: () => number;

  constructor(store: RuntimeStore, devices: DeviceRegistry, now: () => number = Date.now) {
    this.store = store;
    this.devices = devices;
    this.clock = now;
  }

  async pull(token: string, scope: RuntimeScope, cursors: SyncCursor[]): Promise<SyncBatch> {
    const device = this.devices.authenticate(token);
    if (!device) throw new Error('device authentication failed');
    const threads = await this.store.listThreads(scope);
    const out: SyncThread[] = [];
    const next: SyncCursor[] = [];
    const cursorMap = new Map(cursors.map((cursor) => [cursor.threadId, cursor.afterSeq]));
    for (const thread of threads) {
      const after = cursorMap.get(thread.id) ?? 0;
      const events = await this.store.listEvents(thread.id, after, 5000);
      const nextSeq = events.length > 0 ? events[events.length - 1].seq : after;
      out.push({ threadId: thread.id, title: thread.title, status: thread.status, version: thread.version, events: events.length, nextSeq });
      next.push({ threadId: thread.id, afterSeq: nextSeq });
    }
    return { deviceId: device.id, threads: out, cursors: next, serverTime: this.clock() };
  }
}
