import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface CapabilityManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  instructions?: string;
  tools?: string[];
  permissions?: string[];
  eval?: string[];
}

export interface CapabilityRecord {
  manifest: CapabilityManifest;
  enabled: boolean;
  installedAt: number;
}

interface StoreJSON {
  version: 1;
  capabilities: CapabilityRecord[];
}

export class CapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityError';
  }
}

function validate(manifest: CapabilityManifest): void {
  if (manifest.schemaVersion !== 1) throw new CapabilityError('unsupported schemaVersion');
  if (!manifest.id || !/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.id)) throw new CapabilityError('invalid id');
  if (!manifest.name.trim()) throw new CapabilityError('name is empty');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new CapabilityError('version must be semver');
  for (const tool of manifest.tools ?? []) if (!tool.trim()) throw new CapabilityError('empty tool');
  for (const permission of manifest.permissions ?? []) if (!permission.trim()) throw new CapabilityError('empty permission');
}

export class CapabilityRegistry {
  readonly path: string;
  private readonly records = new Map<string, CapabilityRecord>();

  constructor(workspace: string) {
    this.path = join(workspace, '.weft', 'capabilities.json');
    this.load();
  }

  install(manifest: CapabilityManifest): CapabilityRecord {
    validate(manifest);
    const record: CapabilityRecord = {
      manifest: {
        ...manifest,
        tools: [...(manifest.tools ?? [])],
        permissions: [...(manifest.permissions ?? [])],
        eval: [...(manifest.eval ?? [])]
      },
      enabled: true,
      installedAt: Date.now()
    };
    this.records.set(manifest.id, record);
    this.persist();
    return this.clone(record);
  }

  enable(id: string): CapabilityRecord {
    const record = this.require(id);
    record.enabled = true;
    this.persist();
    return this.clone(record);
  }

  disable(id: string): CapabilityRecord {
    const record = this.require(id);
    record.enabled = false;
    this.persist();
    return this.clone(record);
  }

  uninstall(id: string): boolean {
    const existed = this.records.delete(id);
    if (existed) this.persist();
    return existed;
  }

  get(id: string): CapabilityRecord | null {
    const record = this.records.get(id);
    return record ? this.clone(record) : null;
  }

  list(onlyEnabled = false): CapabilityRecord[] {
    return [...this.records.values()]
      .filter((record) => !onlyEnabled || record.enabled)
      .map((record) => this.clone(record));
  }

  private require(id: string): CapabilityRecord {
    const record = this.records.get(id);
    if (!record) throw new CapabilityError('unknown capability: ' + id);
    return record;
  }

  private clone(record: CapabilityRecord): CapabilityRecord {
    return {
      manifest: {
        ...record.manifest,
        tools: [...(record.manifest.tools ?? [])],
        permissions: [...(record.manifest.permissions ?? [])],
        eval: [...(record.manifest.eval ?? [])]
      },
      enabled: record.enabled,
      installedAt: record.installedAt
    };
  }

  private load(): void {
    try {
      const json = JSON.parse(readFileSync(this.path, 'utf8')) as StoreJSON;
      if (json.version !== 1 || !Array.isArray(json.capabilities)) return;
      for (const record of json.capabilities) {
        validate(record.manifest);
        this.records.set(record.manifest.id, this.clone(record));
      }
    } catch {
      // absent or malformed store starts empty
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    const json: StoreJSON = { version: 1, capabilities: this.list() };
    writeFileSync(tmp, JSON.stringify(json, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
