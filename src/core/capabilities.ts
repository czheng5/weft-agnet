import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RuntimeSchemaError, validateCapabilityManifest } from './runtime-schema.ts';
import type { CapabilityManifest, PermissionSet } from './runtime-schema.ts';

export type { CapabilityManifest } from './runtime-schema.ts';

export interface CapabilityRecord {
  manifest: CapabilityManifest;
  enabled: boolean;
  installedAt: number;
}

interface StoreJSON {
  version: 2;
  capabilities: CapabilityRecord[];
}

interface LegacyManifest {
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

interface LegacyStoreJSON {
  version: 1;
  capabilities: Array<{ manifest: LegacyManifest; enabled: boolean; installedAt: number }>;
}

export class CapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityError';
  }
}

function idOf(manifest: CapabilityManifest): string {
  return manifest.id ?? manifest.name;
}

function parseLegacyPermissions(permissions: string[] = []): PermissionSet {
  const out: PermissionSet = { read: [], write: [], exec: [], network: [] };
  for (const permission of permissions) {
    const value = permission.toLowerCase();
    if (value.includes('read')) out.read.push('**');
    else if (value.includes('write')) out.write.push('**');
    else if (value.includes('network') || value.includes('http') || value.includes('net')) out.network.push('**');
    else out.exec.push(permission);
  }
  return out;
}

function legacyToManifest(legacy: LegacyManifest): CapabilityManifest {
  return validateCapabilityManifest({
    schemaVersion: 1,
    id: legacy.id,
    name: legacy.name,
    version: legacy.version,
    description: legacy.description ?? legacy.name,
    instructions: legacy.instructions,
    tools: legacy.tools ?? [],
    permissions: parseLegacyPermissions(legacy.permissions),
    sandbox: 'any',
    evals: legacy.eval ?? []
  });
}

function validate(manifest: CapabilityManifest): void {
  let validated: CapabilityManifest;
  try {
    validated = validateCapabilityManifest(manifest);
  } catch (error) {
    throw new CapabilityError(error instanceof RuntimeSchemaError ? error.message : String(error));
  }
  if (!/^\d+\.\d+\.\d+$/.test(validated.version)) throw new CapabilityError('version must be semver');
  if (!validated.name.trim()) throw new CapabilityError('name is empty');
  if (validated.id !== undefined && !/^[a-z0-9][a-z0-9._-]*$/i.test(validated.id)) throw new CapabilityError('invalid id');
}

function cloneManifest(manifest: CapabilityManifest): CapabilityManifest {
  return {
    ...manifest,
    tools: [...manifest.tools],
    permissions: {
      read: [...manifest.permissions.read],
      write: [...manifest.permissions.write],
      exec: [...manifest.permissions.exec],
      network: [...manifest.permissions.network]
    },
    evals: [...manifest.evals]
  };
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
    const normalized = validateCapabilityManifest(manifest);
    const record: CapabilityRecord = {
      manifest: cloneManifest(normalized),
      enabled: true,
      installedAt: Date.now()
    };
    this.records.set(idOf(normalized), record);
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
      manifest: cloneManifest(record.manifest),
      enabled: record.enabled,
      installedAt: record.installedAt
    };
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as StoreJSON | LegacyStoreJSON;
      if (raw.version === 2 && Array.isArray(raw.capabilities)) {
        for (const record of raw.capabilities) {
          const manifest = validateCapabilityManifest(record.manifest);
          this.records.set(idOf(manifest), this.clone({ manifest, enabled: Boolean(record.enabled), installedAt: Number(record.installedAt) }));
        }
      } else if (raw.version === 1 && Array.isArray(raw.capabilities)) {
        for (const record of raw.capabilities) {
          const manifest = legacyToManifest(record.manifest);
          this.records.set(idOf(manifest), this.clone({ manifest, enabled: Boolean(record.enabled), installedAt: Number(record.installedAt) }));
        }
      }
    } catch {
      // absent or malformed store starts empty
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    const json: StoreJSON = { version: 2, capabilities: this.list() };
    writeFileSync(tmp, JSON.stringify(json, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
