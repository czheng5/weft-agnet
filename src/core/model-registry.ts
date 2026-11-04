import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ModelKind = 'openai-compatible' | 'deepseek' | 'local';

export interface ModelProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  kind: ModelKind;
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ModelProfileInput {
  id: string;
  name: string;
  kind: ModelKind;
  baseUrl: string;
  model: string;
  apiKeyEnv?: string;
}

interface StoreJSON {
  version: 1;
  models: ModelProfile[];
}

export class ModelRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelRegistryError';
  }
}

function validate(input: ModelProfileInput): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(input.id)) throw new ModelRegistryError('invalid model id');
  if (!input.name.trim()) throw new ModelRegistryError('name is empty');
  if (input.kind !== 'openai-compatible' && input.kind !== 'deepseek' && input.kind !== 'local') throw new ModelRegistryError('invalid model kind');
  if (!/^https?:\/\//.test(input.baseUrl)) throw new ModelRegistryError('baseUrl must be http(s)');
  if (!input.model.trim()) throw new ModelRegistryError('model is empty');
  if (input.apiKeyEnv !== undefined && !/^[A-Z_][A-Z0-9_]*$/.test(input.apiKeyEnv)) throw new ModelRegistryError('apiKeyEnv must be an env var name');
}

export class ModelRegistry {
  readonly path: string;
  private readonly models = new Map<string, ModelProfile>();

  constructor(workspace: string) {
    this.path = join(workspace, '.weft', 'models.json');
    this.load();
  }

  upsert(input: ModelProfileInput): ModelProfile {
    validate(input);
    const existing = this.models.get(input.id);
    const now = Date.now();
    const profile: ModelProfile = {
      schemaVersion: 1,
      id: input.id,
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      model: input.model,
      apiKeyEnv: input.apiKeyEnv,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.models.set(profile.id, profile);
    this.persist();
    return { ...profile };
  }

  get(id: string): ModelProfile | null {
    const profile = this.models.get(id);
    return profile ? { ...profile } : null;
  }

  list(): ModelProfile[] {
    return [...this.models.values()].map((profile) => ({ ...profile }));
  }

  remove(id: string): boolean {
    const existed = this.models.delete(id);
    if (existed) this.persist();
    return existed;
  }

  resolveApiKey(id: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
    const profile = this.models.get(id);
    if (!profile?.apiKeyEnv) return undefined;
    return env[profile.apiKeyEnv];
  }

  private load(): void {
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as StoreJSON;
      if (raw.version !== 1 || !Array.isArray(raw.models)) return;
      for (const profile of raw.models) {
        validate(profile);
        this.models.set(profile.id, { ...profile });
      }
    } catch {
      // absent or malformed starts empty
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    const json: StoreJSON = { version: 1, models: this.list() };
    writeFileSync(tmp, JSON.stringify(json, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }
}
