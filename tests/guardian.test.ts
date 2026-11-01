import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RuleBasedGuardian, GuardianService } from '../src/core/guardian.ts';
import { PolicyEngine, ApprovalService } from '../src/core/permissions.ts';

const workspace = join(tmpdir(), 'weft-guardian-ws');

test('rule guardian classifies risk', async () => {
  const g = new RuleBasedGuardian();
  const dangerous = await g.review({ kind: 'exec', command: 'rm -rf /' }, { workspace, mode: 'workspace-write', trust: 'trusted' });
  assert.equal(dangerous.risk, 'critical');
  assert.equal(dangerous.outcome, 'deny');
  const safe = await g.review({ kind: 'exec', command: 'node --version' }, { workspace, mode: 'workspace-write', trust: 'trusted' });
  assert.equal(safe.risk, 'low');
  assert.equal(safe.outcome, 'allow');
  const outside = await g.review({ kind: 'write', path: '../x.txt' }, { workspace, mode: 'workspace-write', trust: 'trusted' });
  assert.equal(outside.risk, 'high');
  assert.equal(outside.outcome, 'deny');
});

test('shadow guardian logs but does not block', async () => {
  let assessments = 0;
  const guardian = new GuardianService({ mode: 'shadow', onAssessment: () => { assessments += 1; } });
  const policy = new PolicyEngine({ workspace, mode: 'workspace-write', approvalPolicy: 'on-request' });
  const svc = new ApprovalService(policy, async () => 'allow-session', guardian);
  const result = await svc.authorize({ kind: 'memory', reason: 'test' });
  assert.equal(result.allowed, true);
  assert.equal(assessments, 1);
});

test('enforce guardian can deny an otherwise allowed action', async () => {
  const denyGuardian = {
    async review() {
      return { risk: 'critical' as const, authorization: 'unknown' as const, outcome: 'deny' as const, rationale: 'test deny', source: 'rule' as const, durationMs: 0 };
    }
  };
  const guardian = new GuardianService({ guardian: denyGuardian, mode: 'enforce' });
  const policy = new PolicyEngine({ workspace, mode: 'workspace-write', approvalPolicy: 'on-request' });
  const svc = new ApprovalService(policy, async () => 'allow-session', guardian);
  const result = await svc.authorize({ kind: 'memory', reason: 'test' });
  assert.equal(result.allowed, false);
  assert.equal(result.source, 'guardian');
});

test('circuit breaker interrupts after repeated denials', async () => {
  let interrupts = 0;
  const denyGuardian = {
    async review() {
      return { risk: 'critical' as const, authorization: 'unknown' as const, outcome: 'deny' as const, rationale: 'deny', source: 'rule' as const, durationMs: 0 };
    }
  };
  const guardian = new GuardianService({ guardian: denyGuardian, mode: 'shadow', onInterrupt: () => { interrupts += 1; } });
  for (let i = 0; i < 3; i += 1) await guardian.review({ kind: 'exec', command: 'x' }, { workspace, mode: 'workspace-write', trust: 'trusted' });
  assert.equal(interrupts, 1);
});
