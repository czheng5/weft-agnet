import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DeploymentError,
  DeploymentOrchestrator,
  LocalArtifactStore,
  deploymentDigest,
  validateDeployment
} from '../src/core/deployment.ts';
import { createThreadRecord } from '../src/core/runtime-schema.ts';
import type { DeploymentSpec } from '../src/core/deployment.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

function spec(dir: string): DeploymentSpec {
  return {
    schemaVersion: 1,
    name: 'weft-prod',
    version: '1.0.0',
    stateStore: { kind: 'sqlite', path: join(dir, 'state.db') },
    artifactStore: { kind: 'local', root: join(dir, 'artifacts') },
    compute: { workers: 2, sandbox: 'bwrap', leaseTtlMs: 10000, pollMs: 50 },
    secrets: { env: ['DEEPSEEK_API_KEY'] }
  };
}

test('deployment plan validates separation and has stable digest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-deploy-'));
  try {
    const config = spec(dir);
    validateDeployment(config);
    const digest = deploymentDigest(config);
    assert.equal(digest, deploymentDigest(config));
    assert.throws(() => validateDeployment({ ...config, compute: { ...config.compute, workers: 0 } }), DeploymentError);
    assert.throws(() => validateDeployment({ ...config, stateStore: { kind: 'postgres' } }), /urlEnv/);
    assert.throws(() => validateDeployment({ ...config, secrets: { env: ['not-a-name'] } }), /env var/);
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* Windows sqlite lock; temp dirs are disposable */ }
  }
});

test('local artifact store is content addressed and idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-artifact-'));
  try {
    const store = new LocalArtifactStore(join(dir, 'artifacts'));
    const first = await store.put('hello');
    const second = await store.put('hello');
    assert.equal(first.digest, second.digest);
    assert.equal((await store.get(first.digest))?.toString(), 'hello');
    assert.equal(await store.has(first.digest), true);
    assert.equal(await store.has('0'.repeat(64)), false);
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* Windows sqlite lock; temp dirs are disposable */ }
  }
});

test('orchestrator starts stateless workers against external state/artifacts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-orch-'));
  try {
    const config = spec(dir);
    const scope: RuntimeScope = { tenantId: 'orch-t', projectId: 'orch-p', workspaceId: 'orch-w' };
    const orchestrator = new DeploymentOrchestrator({
      handler: async (job, thread, artifacts) => {
        await artifacts.put(job.id + ':' + thread.id);
      }
    });
    const runtime = orchestrator.start(config);
    const t1 = createThreadRecord({ scope, title: 'one', status: 'open', now: 1000 });
    const t2 = createThreadRecord({ scope, title: 'two', status: 'open', now: 1000 });
    await runtime.store.createThread(t1);
    await runtime.store.createThread(t2);
    const j1 = await runtime.store.enqueueOutbox({ threadId: t1.id, topic: 'worker.task', payload: {} });
    const j2 = await runtime.store.enqueueOutbox({ threadId: t2.id, topic: 'worker.task', payload: {} });
    let processed = 0;
    for (let i = 0; i < 3; i += 1) processed += await runtime.fleet.runOnce();
    assert.equal(processed, 2);
    assert.equal(await runtime.store.claimOutbox('other', 10).then((jobs) => jobs.length), 0);
    assert.equal(await runtime.artifacts.has((await runtime.artifacts.put(j1.id + ':' + t1.id)).digest), true);
    assert.equal(await runtime.artifacts.has((await runtime.artifacts.put(j2.id + ':' + t2.id)).digest), true);
    assert.equal((await runtime.fleet.health()).workers, 2);
    runtime.fleet.stop();
    runtime.store.close();
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* Windows sqlite lock; temp dirs are disposable */ }
  }
});
