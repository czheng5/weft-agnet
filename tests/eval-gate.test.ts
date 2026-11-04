import test from 'node:test';
import assert from 'node:assert/strict';
import { runEvalSuite } from '../src/core/eval-gate.ts';

test('eval gate aggregates pass/fail and captures errors', async () => {
  const report = await runEvalSuite([
    { name: 'pass', run: () => true },
    { name: 'fail', run: () => false },
    { name: 'throw', run: () => { throw new Error('boom'); } }
  ]);
  assert.equal(report.passed, false);
  assert.equal(report.results.length, 3);
  assert.equal(report.results[0].passed, true);
  assert.equal(report.results[1].passed, false);
  assert.equal(report.results[2].error, 'boom');
  assert.equal((await runEvalSuite([{ name: 'only', run: () => true }])).passed, true);
});
