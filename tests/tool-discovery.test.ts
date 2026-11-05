import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverToolchain, hasEdaTools } from '../src/core/tool-discovery.ts';

test('toolchain discovery scans PATH and PDK roots without network', () => {
  const report = discoverToolchain({ PATH: '', PDK_ROOT: process.cwd() });
  assert.equal(Array.isArray(report.tools), true);
  assert.equal(report.pdks.includes(process.cwd()), true);
  assert.equal(typeof hasEdaTools(report), 'boolean');
});
