import type { Action } from './permissions.ts';
import type { Guardian, GuardianAssessment, GuardianContext, GuardianRisk, GuardianAuthorization, GuardianOutcome } from './guardian.ts';
import { RuleBasedGuardian } from './guardian.ts';
import type { ModelProvider } from './model.ts';

export interface ModelGuardianOptions {
  model: ModelProvider;
  timeoutMs?: number;
  fallback?: Guardian;
}

const SYSTEM = [
  'You are Weft Guardian, a security reviewer for agent actions.',
  'Return ONLY JSON: {"outcome":"allow|deny","risk":"low|medium|high|critical","authorization":"unknown|low|medium|high","rationale":"short"}',
  'Deny destructive commands, writes outside the workspace, and anything requiring elevated authorization.',
  'Do not use markdown fences.'
].join('\n');

function parseAssessment(text: string): { outcome: GuardianOutcome; risk: GuardianRisk; authorization: GuardianAuthorization; rationale: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('guardian model returned no JSON');
  const value = JSON.parse(match[0]) as Record<string, unknown>;
  const outcome = value.outcome === 'allow' ? 'allow' : value.outcome === 'deny' ? 'deny' : null;
  const risk = value.risk;
  const authorization = value.authorization;
  const validRisk = risk === 'low' || risk === 'medium' || risk === 'high' || risk === 'critical';
  const validAuth = authorization === 'unknown' || authorization === 'low' || authorization === 'medium' || authorization === 'high';
  if (!outcome || !validRisk || !validAuth) throw new Error('guardian model returned invalid assessment');
  return { outcome, risk, authorization, rationale: String(value.rationale ?? 'model review') };
}

export class ModelGuardian implements Guardian {
  private readonly model: ModelProvider;
  private readonly timeoutMs: number;
  private readonly fallback: Guardian;

  constructor(opts: ModelGuardianOptions) {
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.fallback = opts.fallback ?? new RuleBasedGuardian();
  }

  async review(action: Action, context: GuardianContext): Promise<GuardianAssessment> {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('guardian model timeout')), this.timeoutMs);
      });
      const response = await Promise.race([
        this.model.complete({
          system: SYSTEM,
          tools: [],
          messages: [{
            role: 'user',
            content: JSON.stringify({ action, context })
          }]
        }),
        timeout
      ]);
      const parsed = parseAssessment(response.content);
      return { ...parsed, source: 'model', durationMs: Date.now() - started };
    } catch (error) {
      const fallback = await this.fallback.review(action, context);
      return {
        ...fallback,
        rationale: fallback.rationale + ' (model fallback: ' + (error instanceof Error ? error.message : String(error)) + ')',
        durationMs: Date.now() - started
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export interface ShadowComparison {
  action: Action;
  rule: GuardianAssessment;
  model: GuardianAssessment;
  mismatch: boolean;
  reason: string;
}

export class GuardianShadow implements Guardian {
  readonly rule: Guardian;
  readonly model: Guardian;
  private readonly onCompare?: (comparison: ShadowComparison) => void;

  constructor(rule: Guardian, model: Guardian, onCompare?: (comparison: ShadowComparison) => void) {
    this.rule = rule;
    this.model = model;
    this.onCompare = onCompare;
  }

  async review(action: Action, context: GuardianContext): Promise<GuardianAssessment> {
    const [ruleResult, modelResult] = await Promise.allSettled([
      this.rule.review(action, context),
      this.model.review(action, context)
    ]);
    const rule = ruleResult.status === 'fulfilled'
      ? ruleResult.value
      : { risk: 'high' as const, authorization: 'unknown' as const, outcome: 'deny' as const, rationale: 'rule guardian failed', source: 'rule' as const, durationMs: 0 };
    const model = modelResult.status === 'fulfilled'
      ? modelResult.value
      : { risk: 'high' as const, authorization: 'unknown' as const, outcome: 'deny' as const, rationale: 'model guardian failed', source: 'rule' as const, durationMs: 0 };
    const mismatch = rule.outcome !== model.outcome || rule.risk !== model.risk;
    this.onCompare?.({
      action,
      rule,
      model,
      mismatch,
      reason: mismatch ? 'rule=' + rule.outcome + '/' + rule.risk + ' model=' + model.outcome + '/' + model.risk : 'agree'
    });
    return rule;
  }
}
