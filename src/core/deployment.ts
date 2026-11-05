import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256 } from './request.ts';
import { SqliteRuntimeStore } from './runtime-store-sqlite.ts';
import type { RuntimeStore } from './runtime-store.ts';
import type { OutboxRecord, ThreadRecord, WorkerLeaseRecord } from './runtime-schema.ts';
import { FairWorkerPool } from './fair-worker-pool.ts';

export interface StateStoreConfig {
  kind: 'sqlite' | 'postgres';
  path?: string;
  urlEnv?: string;
}

export interface ArtifactStoreConfig {
  kind: 'local' | 's3';
  root?: string;
  bucket?: string;
  endpointEnv?: string;
}

export interface ComputeConfig {
  workers: number;
  sandbox: WorkerLeaseRecord['sandbox'];
  leaseTtlMs?: number;
  pollMs?: number;
}

export interface DeploymentSpec {
  schemaVersion: 1;
  name: string;
  version: string;
  stateStore: StateStoreConfig;
  artifactStore: ArtifactStoreConfig;
  compute: ComputeConfig;
  secrets: { env: string[] };
}

export class DeploymentError extends Error {
  constructor(message: string) {
    super('deployment: ' + message);
    this.name = 'DeploymentError';
  }
}

export function validateDeployment(spec: DeploymentSpec): void {
  if (spec.schemaVersion !== 1) throw new DeploymentError('unsupported schemaVersion');
  if (!spec.name.trim() || !spec.version.trim()) throw new DeploymentError('name/version required');
  if (spec.stateStore.kind === 'sqlite' && !spec.stateStore.path) throw new DeploymentError('sqlite path required');
  if (spec.stateStore.kind === 'postgres' && !spec.stateStore.urlEnv) throw new DeploymentError('postgres urlEnv required');
  if (spec.artifactStore.kind === 'local' && !spec.artifactStore.root) throw new DeploymentError('local artifact root required');
  if (spec.artifactStore.kind === 's3' && (!spec.artifactStore.bucket || !spec.artifactStore.endpointEnv)) throw new DeploymentError('s3 bucket/endpointEnv required');
  if (!Number.isInteger(spec.compute.workers) || spec.compute.workers < 1) throw new DeploymentError('workers must be >= 1');
  if (!Array.isArray(spec.secrets.env) || spec.secrets.env.some((item) => !/^[A-Z_][A-Z0-9_]*$/.test(item))) throw new DeploymentError('secrets must be env var names');
  const raw = canonicalJson(spec);
  if (/api[_-]?key|secret[_-]?key|password/i.test(raw) && !/\.env|urlEnv|env/.test(raw)) throw new DeploymentError('inline secret-like field rejected');
}

export function deploymentDigest(spec: DeploymentSpec): string {
  validateDeployment(spec);
  return sha256(canonicalJson(spec));
}

export interface ArtifactStore {
  put(bytes: Buffer | string): Promise<{ digest: string; path: string }>;
  get(digest: string): Promise<Buffer | null>;
  has(digest: string): Promise<boolean>;
}

export class LocalArtifactStore implements ArtifactStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
    mkdirSync(root, { recursive: true });
  }

  private pathFor(digest: string): string {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new DeploymentError('invalid artifact digest');
    return join(this.root, digest.slice(0, 2), digest);
  }

  async put(bytes: Buffer | string): Promise<{ digest: string; path: string }> {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
    const digest = createHash('sha256').update(buffer).digest('hex');
    const path = this.pathFor(digest);
    if (!existsSync(path)) {
      mkdirSync(join(this.root, digest.slice(0, 2)), { recursive: true });
      writeFileSync(path, buffer);
    }
    return { digest, path };
  }

  async get(digest: string): Promise<Buffer | null> {
    const path = this.pathFor(digest);
    return existsSync(path) ? readFileSync(path) : null;
  }

  async has(digest: string): Promise<boolean> {
    return existsSync(this.pathFor(digest));
  }
}

export interface WorkerFleetOptions {
  store: RuntimeStore;
  artifactStore: ArtifactStore;
  compute: ComputeConfig;
  handler: (job: OutboxRecord, thread: ThreadRecord, artifacts: ArtifactStore) => Promise<void>;
  workerIdPrefix?: string;
}

export class WorkerFleet {
  readonly pools: FairWorkerPool[];
  private readonly artifactStore: ArtifactStore;

  constructor(opts: WorkerFleetOptions) {
    this.artifactStore = opts.artifactStore;
    this.pools = Array.from({ length: opts.compute.workers }, (_, index) => new FairWorkerPool({
      store: opts.store,
      concurrency: 1,
      leaseTtlMs: opts.compute.leaseTtlMs,
      pollMs: opts.compute.pollMs,
      workerId: (opts.workerIdPrefix ?? 'fleet') + '-' + index,
      handler: (job, thread) => opts.handler(job, thread, this.artifactStore)
    }));
  }

  start(): void { for (const pool of this.pools) pool.start(); }
  stop(): void { for (const pool of this.pools) pool.stop(); }
  async runOnce(): Promise<number> {
    const counts = await Promise.all(this.pools.map((pool) => pool.runOnce()));
    return counts.reduce((sum, count) => sum + count, 0);
  }
  async health(): Promise<{ workers: number; running: boolean; artifacts: string }> {
    return { workers: this.pools.length, running: this.pools.every((pool) => pool.isRunning()), artifacts: 'connected' };
  }
}

export interface DeploymentRuntime {
  digest: string;
  store: RuntimeStore;
  artifacts: ArtifactStore;
  fleet: WorkerFleet;
}

export interface DeploymentOrchestratorOptions {
  createStore?: (config: StateStoreConfig) => RuntimeStore;
  createArtifactStore?: (config: ArtifactStoreConfig) => ArtifactStore;
  handler: (job: OutboxRecord, thread: ThreadRecord, artifacts: ArtifactStore) => Promise<void>;
}

export class DeploymentOrchestrator {
  private readonly opts: DeploymentOrchestratorOptions;

  constructor(opts: DeploymentOrchestratorOptions) {
    this.opts = opts;
  }

  plan(spec: DeploymentSpec): { digest: string; checks: string[] } {
    validateDeployment(spec);
    return {
      digest: deploymentDigest(spec),
      checks: ['schema', 'state-store', 'artifact-store', 'compute', 'secrets-by-env']
    };
  }

  start(spec: DeploymentSpec): DeploymentRuntime {
    validateDeployment(spec);
    const digest = deploymentDigest(spec);
    const store = this.opts.createStore ? this.opts.createStore(spec.stateStore) : spec.stateStore.kind === 'sqlite' ? new SqliteRuntimeStore(spec.stateStore.path!) : (() => { throw new DeploymentError('postgres store requires createStore injection'); })();
    const artifacts = this.opts.createArtifactStore ? this.opts.createArtifactStore(spec.artifactStore) : spec.artifactStore.kind === 'local' ? new LocalArtifactStore(spec.artifactStore.root!) : (() => { throw new DeploymentError('s3 artifact store requires createArtifactStore injection'); })();
    const fleet = new WorkerFleet({ store, artifactStore: artifacts, compute: spec.compute, handler: this.opts.handler });
    return { digest, store, artifacts, fleet };
  }
}
