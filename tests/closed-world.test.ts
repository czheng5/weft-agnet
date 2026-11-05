import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ClosedWorldError,
  evaluateScenario,
  loadClosedWorldScenario,
  loadClosedWorldSuite,
  loadReferenceSubmission
} from '../src/core/closed-world.ts';

const root = join(process.cwd(), 'scenarios', 'closed-world');

test('closed-world IC scenarios pass with evidence-grounded references', () => {
  const suite = loadClosedWorldSuite(root);
  assert.equal(suite.length, 3);
  for (const scenario of suite) {
    const result = evaluateScenario(scenario, loadReferenceSubmission(root, scenario.dir));
    assert.equal(result.passed, true, scenario.id + ' failed: ' + JSON.stringify(result.checks.filter((check) => !check.passed)));
    assert.equal(result.score, 1);
  }
});

test('closed-world rejects unsupported patch and bad citations', () => {
  const scenario = loadClosedWorldScenario(root, 'ic-fifo');
  const reference = loadReferenceSubmission(root, 'ic-fifo');
  const badPatch = evaluateScenario(scenario, { ...reference, patch: 'assign full = 1;' });
  assert.equal(badPatch.passed, false);
  const badCitation = evaluateScenario(scenario, {
    ...reference,
    findings: reference.findings.map((finding) => ({ ...finding, evidence: [{ path: 'spec.md', line: 999 }] }))
  });
  assert.equal(badCitation.passed, false);
  assert.equal(badCitation.checks.some((check) => check.id.startsWith('evidence:') && !check.passed), true);
});

test('closed-world rejects path traversal in manifests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cw-'));
  try {
    const scenarioDir = join(dir, 'bad');
    mkdirSync(scenarioDir, { recursive: true });
    writeFileSync(join(scenarioDir, 'manifest.json'), JSON.stringify({
      id: 'bad', domain: 'test', title: 'bad', prompt: 'bad',
      files: ['../secret.txt'], expectedFindings: [{ id: 'x', keywords: ['x'] }]
    }), 'utf8');
    assert.throws(() => loadClosedWorldScenario(dir, 'bad'), (error: unknown) => error instanceof ClosedWorldError && /traversal/.test(error.message));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
