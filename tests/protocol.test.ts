import test from 'node:test';
import assert from 'node:assert/strict';
import { WEFT_PROTOCOL, createEnvelope, validateEnvelope, ProtocolError } from '../src/core/protocol.ts';

const scope = { tenantId: 'p-t', projectId: 'p-p', workspaceId: 'p-w' };

test('weft protocol envelope validates version, scope and thread requirement', () => {
  const envelope = createEnvelope({ type: 'thread.message', scope, threadId: 'thread-1', payload: { text: 'hi' }, id: 'env-1', sentAt: 1000 });
  assert.equal(envelope.protocol, WEFT_PROTOCOL);
  assert.equal(validateEnvelope(envelope).threadId, 'thread-1');
  assert.throws(() => validateEnvelope({ ...envelope, protocol: 'weft/0' }), ProtocolError);
  assert.throws(() => validateEnvelope({ ...envelope, threadId: undefined }), /threadId is required/);
  assert.throws(() => validateEnvelope({ ...envelope, scope: { tenantId: 'x' } }), /projectId/);
  assert.equal(createEnvelope({ type: 'thread.create', scope, payload: {} }).threadId, undefined);
});
