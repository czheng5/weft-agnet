import { join } from 'node:path';
import { evaluateEdaManifest, loadEdaManifest } from '../src/core/eda-flow.ts';

const root = join(process.cwd(), 'scenarios', 'closed-world');
const scenarios = ['ic-fifo'];
let passed = 0;
for (const name of scenarios) {
  const dir = join(root, name);
  const manifest = loadEdaManifest(dir);
  const result = evaluateEdaManifest(dir, manifest);
  console.log('EDA ' + result.status.toUpperCase() + '  ' + result.scenario);
  for (const gate of result.gates) console.log('  ' + gate.status.padEnd(10) + ' ' + gate.id + ': ' + gate.detail);
  if (result.status === 'pass') passed += 1;
}
if (passed !== scenarios.length) {
  console.log('EDA BENCH NOT PASS');
  console.log('  no functional/coverage/synthesis/PERC signoff claimed');
  process.exitCode = 2;
} else {
  console.log('EDA BENCH PASS');
}
