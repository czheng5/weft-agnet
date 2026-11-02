import type { SessionEvent } from './events.ts';

export interface MetricsSnapshot {
  events: number;
  approvals: { requested: number; decided: number; allowed: number; denied: number };
  tools: { calls: number; ok: number; failed: number; denied: number };
  cache: { prefixStable: number; cacheReadTokens: number };
  memoryInjected: number;
  guardian: { assessments: number; denials: number };
  latency: { approvalP50: number; approvalP95: number; toolP50: number; toolP95: number };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function dataOf(event: SessionEvent): Record<string, unknown> {
  return (event.data ?? {}) as Record<string, unknown>;
}

export function computeMetrics(events: SessionEvent[]): MetricsSnapshot {
  const approvals = { requested: 0, decided: 0, allowed: 0, denied: 0 };
  const tools = { calls: 0, ok: 0, failed: 0, denied: 0 };
  const cache = { prefixStable: 0, cacheReadTokens: 0 };
  const guardian = { assessments: 0, denials: 0 };
  const approvalLatency: number[] = [];
  const toolLatency: number[] = [];
  const approvalStart = new Map<string, number>();
  const toolStart = new Map<string, number>();
  let memoryInjected = 0;

  for (const event of events) {
    const data = dataOf(event);
    if (event.type === 'approval/requested') {
      approvals.requested += 1;
      const callId = String(data.callId ?? '');
      if (callId) approvalStart.set(callId, event.at);
    } else if (event.type === 'approval/decided') {
      approvals.decided += 1;
      if (data.allowed === true) approvals.allowed += 1;
      else approvals.denied += 1;
      const callId = String(data.callId ?? '');
      const started = approvalStart.get(callId);
      if (started !== undefined) approvalLatency.push(Math.max(0, event.at - started));
    } else if (event.type === 'tool/call') {
      tools.calls += 1;
      const callId = String(data.callId ?? '');
      if (callId) toolStart.set(callId, event.at);
    } else if (event.type === 'tool/result') {
      if (data.ok === true) tools.ok += 1;
      else {
        tools.failed += 1;
        if (String(data.content ?? '').startsWith('denied:')) tools.denied += 1;
      }
      const callId = String(data.callId ?? '');
      const started = toolStart.get(callId);
      if (started !== undefined) toolLatency.push(Math.max(0, event.at - started));
    } else if (event.type === 'request/frozen') {
      if (data.cachePrefixStable === true) cache.prefixStable += 1;
    } else if (event.type === 'model/usage') {
      cache.cacheReadTokens += Number(data.cacheReadTokens ?? 0);
    } else if (event.type === 'memory/injected') {
      memoryInjected += 1;
    } else if (event.type === 'guardian/assessment') {
      guardian.assessments += 1;
      if (data.outcome === 'deny') guardian.denials += 1;
    }
  }

  return {
    events: events.length,
    approvals,
    tools,
    cache,
    memoryInjected,
    guardian,
    latency: {
      approvalP50: percentile(approvalLatency, 50),
      approvalP95: percentile(approvalLatency, 95),
      toolP50: percentile(toolLatency, 50),
      toolP95: percentile(toolLatency, 95)
    }
  };
}

export function formatMetrics(metrics: MetricsSnapshot): string {
  return [
    'metrics: events=' + metrics.events,
    '  approvals requested=' + metrics.approvals.requested + ' allowed=' + metrics.approvals.allowed + ' denied=' + metrics.approvals.denied + ' p50=' + metrics.latency.approvalP50 + 'ms p95=' + metrics.latency.approvalP95 + 'ms',
    '  tools calls=' + metrics.tools.calls + ' ok=' + metrics.tools.ok + ' failed=' + metrics.tools.failed + ' denied=' + metrics.tools.denied + ' p50=' + metrics.latency.toolP50 + 'ms p95=' + metrics.latency.toolP95 + 'ms',
    '  cache prefixStable=' + metrics.cache.prefixStable + ' cacheReadTokens=' + metrics.cache.cacheReadTokens,
    '  memoryInjected=' + metrics.memoryInjected + ' guardian assessments=' + metrics.guardian.assessments + ' denials=' + metrics.guardian.denials
  ].join('\n');
}
