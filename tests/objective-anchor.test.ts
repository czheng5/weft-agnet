import test from 'node:test';
import assert from 'node:assert/strict';
import { DriftError, ObjectiveAnchor } from '../src/core/objective-anchor.ts';

function anchor(overrides: Partial<ConstructorParameters<typeof ObjectiveAnchor>[0]> = {}): ObjectiveAnchor {
  return new ObjectiveAnchor({
    id: 'fix-fifo',
    objective: 'Fix the FIFO full flag and prove it',
    acceptance: ['functional testbench passes', 'synthesis succeeds'],
    allowedPaths: ['src/core/', 'tests/', 'scenarios/'],
    offline: true,
    maxSteps: 20,
    maxFailedAttempts: 2,
    ...overrides
  });
}

test('anchor blocks scope, offline and dependency drift', () => {
  const guard = anchor();
  assert.doesNotThrow(() => guard.check({ kind: 'write', path: 'src/core/x.ts' }));
  assert.throws(() => guard.check({ kind: 'write', path: 'README.md' }), (error: unknown) => error instanceof DriftError && error.code === 'scope-drift');
  const offline = anchor();
  assert.throws(() => offline.check({ kind: 'network', label: 'fetch' }), (error: unknown) => error instanceof DriftError && error.code === 'offline-boundary');
  const commands = anchor();
  assert.throws(() => commands.check({ kind: 'exec', command: 'curl https://example.com' }), /offline/);
  const dependency = anchor();
  assert.throws(() => dependency.check({ kind: 'exec', command: 'npm install left-pad' }), /dependency/);
});

test('anchor stops repeated failures and budget exhaustion', () => {
  const guard = anchor({ maxSteps: 2 });
  guard.check({ kind: 'exec', command: 'npm test' });
  guard.record({ kind: 'exec', command: 'npm test' }, false);
  guard.check({ kind: 'exec', command: 'npm test' });
  guard.record({ kind: 'exec', command: 'npm test' }, false);
  assert.throws(() => guard.check({ kind: 'exec', command: 'npm test' }), (error: unknown) => error instanceof DriftError && error.code === 'rabbit-hole');
  assert.equal(guard.snapshot().blocked, true);

  const budget = anchor({ maxSteps: 1 });
  budget.check({ kind: 'read', path: 'tests/x.test.ts' });
  budget.record({ kind: 'read', path: 'tests/x.test.ts' }, true);
  assert.throws(() => budget.check({ kind: 'read', path: 'tests/x.test.ts' }), (error: unknown) => error instanceof DriftError && error.code === 'budget');
});
