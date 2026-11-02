import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/event-bus.ts';

test('EventBus publish/subscribe/unsubscribe', async () => {
  const bus = new EventBus();
  const seen: string[] = [];
  const off = bus.subscribe('tool', (e) => { seen.push('tool:' + String((e.data as { name?: string }).name)); });
  bus.subscribe('*', (e) => { seen.push('all:' + e.type); });
  await bus.publish('tool', { name: 'read_file' });
  off();
  await bus.publish('tool', { name: 'write_file' });
  assert.deepEqual(seen, ['tool:read_file', 'all:tool', 'all:tool']);
});

test('EventBus history and replay', async () => {
  const bus = new EventBus();
  await bus.publish('permission', { allowed: true });
  await bus.publish('permission', { allowed: false });
  assert.equal(bus.history('permission').length, 2);
  const replayed: boolean[] = [];
  const count = await bus.replay('permission', (e) => { replayed.push(Boolean((e.data as { allowed?: boolean }).allowed)); });
  assert.equal(count, 2);
  assert.deepEqual(replayed, [true, false]);
  bus.clear();
  assert.equal(bus.history().length, 0);
});
