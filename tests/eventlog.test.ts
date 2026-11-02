import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventLog } from '../src/core/events.ts';

test('event log append/read/resume sequence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-events-'));
  try {
    const log = new EventLog({ root: dir });
    log.append('a', { value: 1 });
    log.append('b', { value: 2 });
    const events = log.read();
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.seq), [1, 2]);
    const resumed = new EventLog({ root: dir, sessionId: log.sessionId });
    resumed.append('c', { value: 3 });
    assert.equal(resumed.read().length, 3);
    assert.equal(resumed.read()[2].seq, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
