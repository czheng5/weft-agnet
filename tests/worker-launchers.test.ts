import test from 'node:test';
import assert from 'node:assert/strict';
import { KubernetesLauncher, NomadLauncher } from '../src/core/worker-launchers.ts';
import type { CommandRunner } from '../src/core/worker-launchers.ts';

function fakeRunner(): CommandRunner & { calls: Array<{ command: string; args: string[]; input?: string }> } {
  const calls: Array<{ command: string; args: string[]; input?: string }> = [];
  return {
    calls,
    async run(command, args, input) { calls.push({ command, args, input }); return { ok: true, output: 'ok' }; }
  };
}

const request = {
  deploymentId: 'dep-1', workerId: 'w-1', image: 'ghcr.io/weft/worker:2.5',
  env: [{ name: 'WEFT_PG_URL', secretName: 'weft-db', secretKey: 'url' }, { name: 'MODE', value: 'worker' }]
};

test('kubernetes launcher emits a Job and never inlines secret values', async () => {
  const runner = fakeRunner();
  const launcher = new KubernetesLauncher({ namespace: 'weft', image: 'fallback', runner });
  const manifest = launcher.manifest(request) as { spec: { template: { spec: { containers: Array<{ env: Array<Record<string, unknown>>; image: string }> } } } };
  assert.equal(manifest.spec.template.spec.containers[0].image, 'ghcr.io/weft/worker:2.5');
  assert.equal(manifest.spec.template.spec.containers[0].env[0].valueFrom !== undefined, true);
  assert.equal(JSON.stringify(manifest).includes('supersecret'), false);
  const launched = await launcher.launch(request);
  assert.equal(launched.backend, 'kubernetes');
  assert.equal(runner.calls[0].command, 'kubectl');
  assert.match(runner.calls[0].input ?? '', /weft-w-1/);
});

test('nomad launcher emits a batch job and flattens env', async () => {
  const runner = fakeRunner();
  const launcher = new NomadLauncher({ image: 'fallback', runner });
  const spec = launcher.jobSpec(request) as { Job: { TaskGroups: Array<{ Tasks: Array<{ Env: Record<string, string>; Config: { image: string } }> }> } };
  assert.equal(spec.Job.TaskGroups[0].Tasks[0].Config.image, 'ghcr.io/weft/worker:2.5');
  assert.equal(spec.Job.TaskGroups[0].Tasks[0].Env.MODE, 'worker');
  const launched = await launcher.launch(request);
  assert.equal(launched.backend, 'nomad');
  assert.equal(runner.calls[0].command, 'nomad');
});
