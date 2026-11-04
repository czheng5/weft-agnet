import test from 'node:test';
import assert from 'node:assert/strict';
import { runBench } from '../src/core/bench.ts';

test('bench reports percentiles and errors', async () => {
  const report = await runBench(10, async (index) => { if (index === 3) throw new Error('x'); });
  assert.equal(report.iterations, 10);
  assert.equal(report.errors, 1);
  assert.equal(report.p50Ms >= report.minMs, true);
  assert.equal(report.p95Ms <= report.maxMs, true);
  await assert.rejects(() => runBench(0, async () => undefined), /positive/);
});
