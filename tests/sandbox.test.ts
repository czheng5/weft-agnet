import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceGuard } from '../src/core/sandbox.ts';
import { createShellRunner, buildWslArgs, decodeWslList, WslSandboxBackend, SandboxUnavailableError } from '../src/core/sandbox-backends.ts';

test('WSL command builder keeps workspace and user explicit', () => {
  const args = buildWslArgs({ distro: 'weft-sandbox', user: 'weft', workspaceMount: '/workspace', command: 'echo hi' });
  assert.deepEqual(args, ['-d', 'weft-sandbox', '-u', 'weft', '--cd', '/workspace', '--', 'bash', '-lc', 'echo hi']);
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

test('unimplemented backend fails closed', async () => {
  const guard = new WorkspaceGuard(join(tmpdir(), 'weft-sandbox-test'));
  await assert.rejects(() => createShellRunner('windows-restricted-token', guard, 'workspace-write'), (error: unknown) => {
    return error instanceof SandboxUnavailableError;
  });
});
