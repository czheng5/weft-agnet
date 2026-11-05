import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FilePercAdapter, coverageGate, parsePercReport, parseVerilatorCoverageInfo } from '../src/core/eda-evidence.ts';

const info = [
  'SF:/rtl/a.v',
  'DA:1,1',
  'DA:2,0',
  'DA:3,2',
  'end_of_record',
  'SF:/rtl/b.v',
  'DA:1,1',
  'end_of_record'
].join('\n');

test('coverage parser computes line coverage and gate', () => {
  const report = parseVerilatorCoverageInfo(info);
  assert.equal(report.lines, 4);
  assert.equal(report.covered, 3);
  assert.equal(report.linePercent, 75);
  assert.equal(coverageGate(report, 70).status, 'pass');
  assert.equal(coverageGate(report, 90).status, 'fail');
  assert.throws(() => coverageGate(report, 101), /0..100/);
});

test('PERC adapter distinguishes clean, violations and missing report', () => {
  assert.deepEqual(parsePercReport('violations: 0'), { violations: 0, detail: 'PERC clean' });
  assert.equal(parsePercReport('violations: 3').violations, 3);
  assert.equal(parsePercReport('no PERC violations found').violations, 0);
  assert.equal(parsePercReport('not a perc report').violations, null);
  const dir = mkdtempSync(join(tmpdir(), 'weft-perc-'));
  try {
    const path = join(dir, 'perc.txt');
    writeFileSync(path, 'violations = 0\n', 'utf8');
    assert.equal(new FilePercAdapter().evaluate(path).violations, 0);
    assert.equal(new FilePercAdapter().evaluate(join(dir, 'missing.txt')).violations, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
