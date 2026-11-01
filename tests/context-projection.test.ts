import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextProjector } from '../src/core/context-projection.ts';
import type { ModelMessage } from '../src/core/session.ts';

test('ContextProjector compacts middle and restores originals', () => {
  const messages: ModelMessage[] = [
    { role: 'system', content: 'system' },
    ...Array.from({ length: 9 }, (_, i) => ({ role: 'user' as const, content: 'message-' + i }))
  ];
  const projector = new ContextProjector();
  const projected = projector.project(messages, { maxMessages: 5, preserveRecent: 2, maxSummaryChars: 80 });
  assert.equal(projected.compacted, true);
  assert.ok(projected.messages.length <= 5);
  assert.match(projected.messages.find((m) => m.content.includes('Earlier context summary'))?.content ?? '', /message-0/);
  assert.equal(projected.dropped.length, 7);
  assert.equal(projected.original.length, 10);
  assert.equal(projector.restore(projected).length, 10);
  assert.equal(projector.restore(projected)[9].content, 'message-8');
});

test('ContextProjector leaves short contexts untouched', () => {
  const messages: ModelMessage[] = [{ role: 'user', content: 'hello' }];
  const projected = new ContextProjector().project(messages);
  assert.equal(projected.compacted, false);
  assert.equal(projected.messages.length, 1);
  assert.equal(projected.summary, '');
});
