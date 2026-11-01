import test from 'node:test';
import assert from 'node:assert/strict';
import { ActorRuntime } from '../src/core/actors.ts';

test('ActorRuntime spawn/list/result', async () => {
  const runtime = new ActorRuntime();
  const handle = runtime.spawn({ name: 'worker', run: async () => 42 });
  assert.equal(handle.status, 'running');
  assert.equal(await runtime.wait<number>(handle.id), 42);
  assert.equal(runtime.get(handle.id)?.status, 'done');
  assert.equal(runtime.list().length, 1);
});

test('ActorRuntime parent/children and mailbox', async () => {
  const runtime = new ActorRuntime();
  const parent = runtime.spawn({ name: 'parent', run: async () => 'p' });
  const child = runtime.spawn({
    name: 'child',
    parentId: parent.id,
    run: async (ctx) => {
      runtime.send(ctx.id, 'hello');
      return runtime.mailbox(ctx.id);
    }
  });
  assert.equal(runtime.children(parent.id).length, 1);
  const messages = await runtime.wait<unknown[]>(child.id);
  assert.deepEqual(messages, ['hello']);
});

test('ActorRuntime stop is cooperative', async () => {
  const runtime = new ActorRuntime();
  const handle = runtime.spawn({
    name: 'slow',
    run: async (ctx) => {
      await new Promise((_, reject) => {
        ctx.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      return 'never';
    }
  });
  runtime.stop(handle.id);
  await assert.rejects(() => runtime.wait(handle.id));
  assert.equal(runtime.get(handle.id)?.status, 'stopped');
});

test('ActorRuntime failure is observable', async () => {
  const runtime = new ActorRuntime();
  const handle = runtime.spawn({ name: 'bad', run: async () => { throw new Error('boom'); } });
  await assert.rejects(() => runtime.wait(handle.id), /boom/);
  assert.equal(runtime.get(handle.id)?.status, 'failed');
});
