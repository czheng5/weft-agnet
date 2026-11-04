import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createThreadRecord,
  assertSameScope,
  validateMandate,
  validateCapabilityManifest,
  validateRuntimeEvent,
  validateWorkerLease,
  RuntimeSchemaError
} from '../src/core/runtime-schema.ts';
import type { RuntimeScope } from '../src/core/runtime-schema.ts';

const scope: RuntimeScope = { tenantId: 't1', projectId: 'p1', workspaceId: 'w1' };

test('thread records require a complete scope', () => {
  const thread = createThreadRecord({ scope, title: 'demo', status: 'open', now: 1000 });
  assert.equal(thread.status, 'open');
  assert.equal(thread.version, 1);
  assert.equal(thread.createdAt, 1000);
  assert.throws(() => createThreadRecord({ scope: { tenantId: 't1' } as RuntimeScope, title: 'bad', status: 'open' }), RuntimeSchemaError);
});

test('scope crossing is rejected', () => {
  assert.doesNotThrow(() => assertSameScope(scope, { ...scope }));
  assert.throws(() => assertSameScope(scope, { ...scope, tenantId: 't2' }), /cross tenant/);
});

test('worker lease must not expire before heartbeat', () => {
  const valid = {
    id: 'lease-1', threadId: 'thread-1', scope, status: 'running',
    configVersion: 'cfg-1', model: 'deepseek-chat', sandbox: 'bwrap',
    leaseUntil: 2000, heartbeatAt: 1000, createdAt: 500
  };
  assert.equal(validateWorkerLease(valid).sandbox, 'bwrap');
  assert.throws(() => validateWorkerLease({ ...valid, leaseUntil: 500 }), /lease expired/);
  assert.throws(() => validateWorkerLease({ ...valid, sandbox: 'none' }), /unknown sandbox/);
});

test('runtime events require positive monotonic sequence shape', () => {
  const event = { id: 'evt-1', threadId: 'thread-1', seq: 1, type: 'thread.created', at: 1000, data: { ok: true } };
  assert.equal(validateRuntimeEvent(event).seq, 1);
  assert.throws(() => validateRuntimeEvent({ ...event, seq: 0 }), /positive integer/);
  assert.throws(() => validateRuntimeEvent({ ...event, type: '' }), /non-empty/);
});

test('mandates and capability manifests validate task-scoped permissions', () => {
  const mandate = {
    id: 'mandate-1', threadId: 'thread-1', scope,
    capabilities: ['fs.read', 'fs.write'],
    permissions: { read: ['**'], write: ['**'], exec: ['test'], network: [] },
    createdAt: 1000, expiresAt: 2000, version: 1
  };
  assert.equal(validateMandate(mandate).expiresAt, 2000);
  assert.throws(() => validateMandate({ ...mandate, expiresAt: 1000 }), /after createdAt/);

  const capability = {
    name: 'weft.demo', version: '1.0.0', description: 'demo capability',
    tools: ['read_file'], permissions: { read: ['**'], write: [], exec: [], network: [] },
    sandbox: 'bwrap', evals: ['test']
  };
  assert.equal(validateCapabilityManifest(capability).sandbox, 'bwrap');
  assert.throws(() => validateCapabilityManifest({ ...capability, sandbox: 'firecracker' }), /unknown sandbox/);
});
