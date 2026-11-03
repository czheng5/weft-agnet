import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PolicyEngine, ApprovalService, pathInside, isDangerousCommand } from '../src/core/permissions.ts';

const workspace = join(tmpdir(), 'weft-perm-ws');

function policy(mode: 'read-only' | 'workspace-write' | 'danger-full-access', approval: 'untrusted' | 'on-request' | 'never' | 'sandboxed', enforced = false) {
  return new PolicyEngine({ workspace, mode, approvalPolicy: approval, sandboxEnforced: enforced });
}

test('workspace containment', () => {
  assert.equal(pathInside(workspace, 'a/b.txt'), true);
  assert.equal(pathInside(workspace, '..'), false);
  assert.equal(pathInside(workspace, join(workspace, '..', 'other.txt')), false);
});

test('write policy modes', () => {
  assert.equal(policy('workspace-write', 'on-request').evaluate({ kind: 'write', path: 'a.txt' }).type, 'allow');
  assert.equal(policy('read-only', 'on-request').evaluate({ kind: 'write', path: 'a.txt' }).type, 'deny');
  assert.equal(policy('workspace-write', 'on-request').evaluate({ kind: 'write', path: '../x.txt' }).type, 'ask');
  assert.equal(policy('danger-full-access', 'on-request').evaluate({ kind: 'write', path: '../x.txt' }).type, 'allow');
});

test('exec policy', () => {
  assert.equal(isDangerousCommand('rm -rf /'), true);
  assert.equal(policy('workspace-write', 'on-request').evaluate({ kind: 'exec', command: 'rm -rf /' }).type, 'deny');
  assert.equal(policy('workspace-write', 'on-request').evaluate({ kind: 'exec', command: 'node --version' }).type, 'allow');
  assert.equal(policy('workspace-write', 'on-request').evaluate({ kind: 'exec', command: 'curl http://x' }).type, 'ask');
  assert.equal(policy('workspace-write', 'never').evaluate({ kind: 'exec', command: 'curl http://x' }).type, 'deny');
});

test('sandboxed approval auto-allows exec only with enforced backend', () => {
  assert.equal(policy('workspace-write', 'sandboxed', true).evaluate({ kind: 'exec', command: 'python script.py' }).type, 'allow');
  assert.equal(policy('workspace-write', 'sandboxed', false).evaluate({ kind: 'exec', command: 'python script.py' }).type, 'ask');
  assert.equal(policy('workspace-write', 'sandboxed', true).evaluate({ kind: 'exec', command: 'rm -rf /' }).type, 'deny');
});

test('approval cache avoids second ask', async () => {
  let asks = 0;
  const svc = new ApprovalService(policy('workspace-write', 'on-request'), async () => {
    asks += 1;
    return 'allow-session';
  });
  const first = await svc.authorize({ kind: 'exec', command: 'curl http://x' });
  const second = await svc.authorize({ kind: 'exec', command: 'curl http://x' });
  assert.equal(first.allowed, true);
  assert.equal(second.source, 'cache');
  assert.equal(asks, 1);
});
