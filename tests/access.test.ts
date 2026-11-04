import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRole, resolvePrincipal, AccessError } from '../src/core/access.ts';
import type { Principal } from '../src/core/access.ts';

const scope = { tenantId: 't', projectId: 'p', workspaceId: 'w' };
const principals: Principal[] = [
  { id: 'reader', token: 'r', role: 'reader', scope },
  { id: 'writer', token: 'w', role: 'writer', scope },
  { id: 'admin', token: 'a', role: 'admin', scope }
];

test('access roles and bearer resolution fail closed', () => {
  assert.doesNotThrow(() => assertRole(principals[2], 'admin'));
  assert.doesNotThrow(() => assertRole(principals[1], 'reader'));
  assert.throws(() => assertRole(principals[0], 'writer'), (error: unknown) => error instanceof AccessError && error.status === 403);
  assert.equal(resolvePrincipal(principals, 'Bearer w')?.id, 'writer');
  assert.equal(resolvePrincipal(principals, 'Bearer nope'), null);
  assert.equal(resolvePrincipal(principals, undefined), null);
});
