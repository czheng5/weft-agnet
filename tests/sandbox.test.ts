import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceGuard, ShellSandbox } from '../src/core/sandbox.ts';
import { createShellRunner, buildWslArgs, buildDockerArgs, decodeWslList, WslSandboxBackend, DockerSandboxBackend, DockerLauncher, SandboxUnavailableError } from '../src/core/sandbox-backends.ts';


test('workspace shell captures output without pipes', async () => {
  const workspace = join(tmpdir(), 'weft-shell-' + Date.now());
  const guard = new WorkspaceGuard(workspace);
  const runner = new ShellSandbox(guard, 'workspace-write');
  const result = await runner.run('node -e "console.log(123)"');
  assert.equal(result.code, 0);
  assert.match(result.stdout, /123/);
});

test('WSL command builder keeps workspace and user explicit', () => {
  const args = buildWslArgs({ distro: 'weft-sandbox', user: 'weft', workspaceMount: '/workspace', command: 'echo hi' });
  assert.deepEqual(args, ['-d', 'weft-sandbox', '-u', 'weft', '--cd', '/workspace', '--', 'bash', '-lc', 'echo hi']);
});


test('Docker command builder hardens the container', () => {
  const args = buildDockerArgs({
    dockerPath: 'docker.exe',
    image: 'node:24-bookworm-slim',
    workspace: 'D:\\work\\weft',
    user: '1000:1000',
    memory: '512m',
    cpus: '1',
    pidsLimit: 256,
    command: 'echo hi'
  });
  assert.equal(args.includes('--network'), true);
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert.equal(args.includes('--read-only'), true);
  assert.equal(args[args.indexOf('--cap-drop') + 1], 'ALL');
  assert.equal(args[args.indexOf('--security-opt') + 1], 'no-new-privileges');
  assert.equal(args[args.indexOf('--user') + 1], '1000:1000');
  assert.equal(args.includes('node:24-bookworm-slim'), true);
  assert.equal(args[args.length - 1], 'echo hi');
});

test('Docker backend declares OS boundary', () => {
  const backend = new DockerSandboxBackend({ workspace: 'D:\\work\\weft' });
  assert.equal(backend.info.osBoundary, true);
  assert.equal(backend.info.backend, 'docker');
});

test('WSL list decoder handles utf16 output', () => {
  const buf = Buffer.from('Kali\0Ubuntu\0', 'utf16le');
  assert.deepEqual(decodeWslList(buf), ['Kali', 'Ubuntu']);
});

test('WSL backend declares VM boundary', () => {
  const backend = new WslSandboxBackend({ distro: 'weft-sandbox' });
  assert.equal(backend.info.osBoundary, true);
  assert.equal(backend.info.backend, 'wsl');
});


test('Docker launcher starts daemon and waits for readiness', async () => {
  let probes = 0;
  let started = false;
  const events: string[] = [];
  const launcher = new DockerLauncher({
    probe: async () => {
      probes += 1;
      return probes > 1
        ? { kind: 'docker', available: true, reason: 'ready' }
        : { kind: 'docker', available: false, reason: 'stopped' };
    },
    start: async () => { started = true; return true; },
    sleep: async () => {},
    timeoutMs: 1000,
    pollMs: 1,
    onEvent: (e) => events.push(e.stage)
  });
  const result = await launcher.ensure();
  assert.equal(started, true);
  assert.equal(result.probe.available, true);
  assert.equal(result.started, true);
  assert.deepEqual(events, ['probe', 'wait', 'ready']);
});

test('Docker launcher fails closed if it cannot start', async () => {
  const launcher = new DockerLauncher({
    probe: async () => ({ kind: 'docker', available: false, reason: 'stopped' }),
    start: async () => false,
    sleep: async () => {},
    timeoutMs: 100,
    pollMs: 1
  });
  const result = await launcher.ensure();
  assert.equal(result.probe.available, false);
  assert.equal(result.started, false);
});

test('unimplemented backend fails closed', async () => {
  const guard = new WorkspaceGuard(join(tmpdir(), 'weft-sandbox-test'));
  await assert.rejects(() => createShellRunner('windows-restricted-token', guard, 'workspace-write'), (error: unknown) => {
    return error instanceof SandboxUnavailableError;
  });
});
