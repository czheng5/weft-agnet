import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileRevocationStore } from '../src/core/token-revocation.ts';

test('revocation store persists, expires and cleans records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-rev-'));
  try {
    const path = join(dir, 'revocations.json');
    const store = new FileRevocationStore(path);
    store.revoke('jti-1', 2000, 1000);
    assert.equal(store.isRevoked('jti-1', 1500), true);
    assert.equal(store.isRevoked('jti-1', 2500), false);
    const reloaded = new FileRevocationStore(path);
    reloaded.revoke('jti-2', 5000, 1000);
    assert.equal(reloaded.isRevoked('jti-2', 2000), true);
    assert.equal(reloaded.cleanup(6000), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
