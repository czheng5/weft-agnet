import test from 'node:test';
import assert from 'node:assert/strict';
import { CuaGuard } from '../src/core/cua.ts';

test('CUA default ask, sensitive deny, explicit allow', () => {
  const guard = new CuaGuard({ defaultAccess: 'ask' });
  assert.equal(guard.evaluate({ appId: 'vscode', action: 'click', locked: false }).access, 'ask');
  assert.equal(guard.evaluate({ appId: '1password', action: 'click', locked: false }).access, 'deny');
  const allowed = new CuaGuard({ defaultAccess: 'ask', apps: { '1password': 'allow' } });
  assert.equal(allowed.evaluate({ appId: '1password', action: 'click', locked: false }).access, 'allow');
});

test('locked screen denied unless allowed', () => {
  const guard = new CuaGuard({ defaultAccess: 'allow' });
  assert.equal(guard.evaluate({ appId: 'vscode', action: 'click', locked: true }).access, 'deny');
  const unlocked = new CuaGuard({ defaultAccess: 'allow', allowLockedScreen: true });
  assert.equal(unlocked.evaluate({ appId: 'vscode', action: 'click', locked: true }).access, 'allow');
});
