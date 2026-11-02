import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Scheduler, SchedulerStore } from '../src/core/scheduler.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Scheduler wakeup fires and disables', async () => {
  const scheduler = new Scheduler();
  let fired = 0;
  scheduler.registerHandler('wake', () => { fired += 1; });
  const job = scheduler.schedule({ id: 'w1', kind: 'wakeup', handler: 'wake', at: Date.now() + 10 });
  scheduler.start();
  await delay(50);
  scheduler.stop();
  assert.equal(fired, 1);
  assert.equal(scheduler.list().find((j) => j.id === job.id)?.enabled, false);
});

test('Scheduler interval fires repeatedly and stops', async () => {
  const scheduler = new Scheduler();
  let fired = 0;
  scheduler.registerHandler('tick', () => { fired += 1; });
  scheduler.schedule({ id: 'i1', kind: 'interval', handler: 'tick', intervalMs: 10 });
  scheduler.start();
  await delay(55);
  scheduler.stop();
  assert.ok(fired >= 2);
});

test('Scheduler store restore resumes wakeup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-sched-'));
  try {
    const store = new SchedulerStore(dir);
    const first = new Scheduler({ store });
    first.registerHandler('wake', () => {});
    first.schedule({ id: 'w1', kind: 'wakeup', handler: 'wake', at: Date.now() + 20 });
    const snapshot = store.load();
    assert.equal(snapshot.length, 1);

    const second = new Scheduler({ store });
    let fired = 0;
    second.registerHandler('wake', () => { fired += 1; });
    second.restore(snapshot);
    second.start();
    await delay(60);
    second.stop();
    assert.equal(fired, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
