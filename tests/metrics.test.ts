import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, formatMetrics } from '../src/core/metrics.ts';
import type { SessionEvent } from '../src/core/events.ts';

function event(seq: number, type: string, data: unknown, at: number): SessionEvent {
  return { id: 'evt-' + seq, sessionId: 's1', seq, type, data, at };
}

test('metrics aggregate approvals/tools/cache/guardian/latency', () => {
  const events: SessionEvent[] = [
    event(1, 'approval/requested', { callId: 'c1' }, 100),
    event(2, 'approval/decided', { callId: 'c1', allowed: true }, 120),
    event(3, 'tool/call', { callId: 'c1', name: 'read_file' }, 130),
    event(4, 'tool/result', { callId: 'c1', name: 'read_file', ok: true, content: 'ok' }, 180),
    event(5, 'tool/call', { callId: 'c2', name: 'run_shell' }, 200),
    event(6, 'tool/result', { callId: 'c2', name: 'run_shell', ok: false, content: 'denied: no' }, 260),
    event(7, 'model/usage', { cacheReadTokens: 12 }, 300),
    event(8, 'request/frozen', { cachePrefixStable: true }, 310),
    event(9, 'memory/injected', { ids: ['m1'], count: 1 }, 320),
    event(10, 'guardian/assessment', { outcome: 'deny' }, 330)
  ];
  const metrics = computeMetrics(events);
  assert.equal(metrics.approvals.requested, 1);
  assert.equal(metrics.approvals.allowed, 1);
  assert.equal(metrics.tools.calls, 2);
  assert.equal(metrics.tools.denied, 1);
  assert.equal(metrics.cache.cacheReadTokens, 12);
  assert.equal(metrics.cache.prefixStable, 1);
  assert.equal(metrics.memoryInjected, 1);
  assert.equal(metrics.guardian.denials, 1);
  assert.equal(metrics.latency.approvalP50, 20);
  assert.equal(metrics.latency.toolP50, 50);
  assert.match(formatMetrics(metrics), /cacheReadTokens=12/);
});
