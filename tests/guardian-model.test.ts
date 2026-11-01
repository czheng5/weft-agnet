import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelGuardian, GuardianShadow } from '../src/core/guardian-model.ts';
import { RuleBasedGuardian } from '../src/core/guardian.ts';
import type { Guardian } from '../src/core/guardian.ts';

const context = { workspace: 'D:\\work', mode: 'workspace-write', trust: 'trusted' as const };

test('ModelGuardian parses model JSON and marks source', async () => {
  const model = {
    id: 'fake',
    async complete() {
      return { content: '{"outcome":"deny","risk":"high","authorization":"unknown","rationale":"test"}', toolCalls: [] };
    }
  };
  const guardian = new ModelGuardian({ model });
  const result = await guardian.review({ kind: 'write', path: '..\\x' }, context);
  assert.equal(result.outcome, 'deny');
  assert.equal(result.risk, 'high');
  assert.equal(result.source, 'model');
});

test('ModelGuardian falls back to rule on bad JSON', async () => {
  const model = {
    id: 'bad',
    async complete() { return { content: 'not json', toolCalls: [] }; }
  };
  const guardian = new ModelGuardian({ model });
  const result = await guardian.review({ kind: 'exec', command: 'rm -rf /' }, context);
  assert.equal(result.outcome, 'deny');
  assert.equal(result.source, 'rule');
  assert.match(result.rationale, /fallback/);
});

test('GuardianShadow records mismatch and returns rule decision', async () => {
  let comparison: { mismatch: boolean; reason: string } | undefined;
  const model: Guardian = {
    async review() {
      return { risk: 'high', authorization: 'unknown', outcome: 'deny', rationale: 'model deny', source: 'model', durationMs: 0 };
    }
  };
  const shadow = new GuardianShadow(new RuleBasedGuardian(), model, (c) => { comparison = c; });
  const result = await shadow.review({ kind: 'memory' }, context);
  assert.equal(result.outcome, 'allow');
  assert.equal(comparison?.mismatch, true);
});
