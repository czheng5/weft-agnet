import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { discoverEdaTools, evaluateEdaManifest, loadEdaManifest } from '../src/core/eda-flow.ts';

const dir = join(process.cwd(), 'scenarios', 'closed-world', 'ic-fifo');

test('EDA gate never claims pass without coverage and PERC signoff', () => {
  const manifest = loadEdaManifest(dir);
  assert.equal(manifest.top, 'sync_fifo');
  const tools = discoverEdaTools();
  assert.equal(tools.length, 4);
  const result = evaluateEdaManifest(dir, manifest);
  assert.notEqual(result.status, 'pass');
  assert.equal(result.gates.some((gate) => gate.id === 'perc' && gate.status !== 'pass'), true);
  assert.equal(result.gates.some((gate) => gate.id === 'coverage' && gate.status !== 'pass'), true);
});
