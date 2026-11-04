import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpSource } from '../src/core/http-source.ts';

test('http source deduplicates items across polls', async () => {
  const payloads: unknown[] = [
    { items: [{ id: 'a', text: 'first' }, { id: 'b', text: 'second' }, { id: '', text: 'bad' }] },
    { items: [{ id: 'a', text: 'first' }, { id: 'c', text: 'third' }] }
  ];
  const seen: string[] = [];
  const source = new HttpSource({
    url: 'http://test.local/items',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payloads.shift() }) as Response,
    handler: (item) => { seen.push(item.id); }
  });
  assert.equal(await source.pollOnce(), 2);
  assert.equal(await source.pollOnce(), 1);
  assert.deepEqual(seen, ['a', 'b', 'c']);
  assert.equal(source.isRunning(), false);
  source.start();
  assert.equal(source.isRunning(), true);
  source.stop();
  assert.equal(source.isRunning(), false);
});
