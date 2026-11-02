import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, canonicalJson, deepFreeze } from '../src/core/request.ts';
import type { ToolSchema } from '../src/core/request.ts';

const tools: ToolSchema[] = [
  { name: 'zeta', description: 'z', parameters: { type: 'object', properties: {} } },
  { name: 'alpha', description: 'a', parameters: { type: 'object', properties: {} } }
];

test('request sorts tools and keeps prefix stable', () => {
  const a = buildRequest({ system: 'sys', tools, messages: [{ role: 'user', content: 'hi' }], instruction: 'do it' });
  const b = buildRequest({ system: 'sys', tools, messages: [{ role: 'user', content: 'hi' }], instruction: 'do it' });
  assert.deepEqual(a.tools.map((t) => t.name), ['alpha', 'zeta']);
  assert.equal(a.prefixHash, b.prefixHash);
  assert.equal(a.requestHash, b.requestHash);
});

test('prefix excludes the new instruction', () => {
  const a = buildRequest({ system: 'sys', tools, messages: [{ role: 'user', content: 'hi' }], instruction: 'one' });
  const b = buildRequest({ system: 'sys', tools, messages: [{ role: 'user', content: 'hi' }], instruction: 'two' });
  assert.equal(a.prefixHash, b.prefixHash);
  assert.notEqual(a.requestHash, b.requestHash);
});

test('runtime context is appended after history', () => {
  const req = buildRequest({ system: 'sys', tools, messages: [], instruction: 'go', runtimeContext: 'cwd: C:/x' });
  assert.equal(req.messages[0].role, 'user');
  assert.match(req.messages[0].content, /cwd: C:\/x/);
  assert.equal(req.messages[1].content, 'go');
});

test('canonical json is key-stable and deepFreeze blocks mutation', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  const frozen = deepFreeze({ nested: { value: 1 } });
  assert.throws(() => { (frozen.nested as { value: number }).value = 2; });
});
