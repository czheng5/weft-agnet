import { join } from 'node:path';
import { evaluateScenario, loadClosedWorldSuite, loadReferenceSubmission } from '../src/core/closed-world.ts';

const root = join(process.cwd(), 'scenarios', 'closed-world');
const suite = loadClosedWorldSuite(root);
let failed = 0;
for (const scenario of suite) {
  const result = evaluateScenario(scenario, loadReferenceSubmission(root, scenario.dir));
  console.log((result.passed ? 'REFERENCE-ONLY OK' : 'REFERENCE FAIL') + '  ' + scenario.id + '  score=' + result.score.toFixed(2));
  if (!result.passed) {
    failed += 1;
    for (const check of result.checks.filter((item) => !item.passed)) console.log('  - ' + check.id + ': ' + check.detail);
  }
}
if (failed > 0) {
  console.log('CLOSED-WORLD BENCH FAIL');
  process.exitCode = 1;
} else {
  console.log('CLOSED-WORLD REFERENCE CHECK PASS');
  console.log('  scenarios=' + suite.length + ' offline=true');
  console.log('  NOT a hardware signoff; use scripts/eda-bench.ts for functional/coverage/synthesis/PERC gates.');
}
