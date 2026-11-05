import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RevocationRecord {
  jti: string;
  revokedAt: number;
  expiresAt: number;
}

export interface RevocationStore {
  revoke(jti: string, expiresAt: number, now?: number): void;
  isRevoked(jti: string, now?: number): boolean;
  cleanup(now?: number): number;
}

export class FileRevocationStore implements RevocationStore {
  readonly path: string;
  private readonly records = new Map<string, RevocationRecord>();

  constructor(path: string) {
    this.path = path;
    this.load();
  }

  revoke(jti: string, expiresAt: number, now = Date.now()): void {
    if (!jti.trim()) throw new Error('jti is empty');
    if (!Number.isFinite(expiresAt)) throw new Error('expiresAt must be finite');
    this.records.set(jti, { jti, revokedAt: now, expiresAt });
    this.persist();
  }

  isRevoked(jti: string, now = Date.now()): boolean {
    const record = this.records.get(jti);
    if (!record) return false;
    if (record.expiresAt <= now) { this.records.delete(jti); return false; }
    return true;
  }

  cleanup(now = Date.now()): number {
    let removed = 0;
    for (const [jti, record] of this.records) {
      if (record.expiresAt <= now) { this.records.delete(jti); removed += 1; }
    }
    if (removed > 0) this.persist();
    return removed;
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as { version?: number; records?: RevocationRecord[] };
      if (raw.version !== 1 || !Array.isArray(raw.records)) return;
      for (const record of raw.records) {
        if (typeof record.jti === 'string' && Number.isFinite(record.expiresAt)) this.records.set(record.jti, record);
      }
    } catch {
      // absent or malformed starts empty
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify({ version: 1, records: [...this.records.values()] }, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
