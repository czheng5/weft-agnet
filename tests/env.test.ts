import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnvFile } from '../src/core/env.ts';

test('loadEnvFile parses values without overriding existing env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-env-'));
  try {
    const path = join(dir, '.env');
    writeFileSync(path, 'WEFT_TEST_KEY=abc\nWEFT_QUOTED="hello world"\n# comment\n', 'utf8');
    const old = process.env.WEFT_TEST_KEY;
    delete process.env.WEFT_TEST_KEY;
    const result = loadEnvFile(path);
    assert.equal(result.loaded, true);
    assert.equal(process.env.WEFT_TEST_KEY, 'abc');
    assert.equal(process.env.WEFT_QUOTED, 'hello world');
    process.env.WEFT_TEST_KEY = 'existing';
    loadEnvFile(path);
    assert.equal(process.env.WEFT_TEST_KEY, 'existing');
    if (old === undefined) delete process.env.WEFT_TEST_KEY;
    else process.env.WEFT_TEST_KEY = old;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
