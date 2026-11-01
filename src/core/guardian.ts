import type { Action } from './permissions.ts';
import { isDangerousCommand, isSafeCommand, pathInside } from './permissions.ts';

export type GuardianRisk = 'low' | 'medium' | 'high' | 'critical';
export type GuardianAuthorization = 'unknown' | 'low' | 'medium' | 'high';
export type GuardianOutcome = 'allow' | 'deny';

export interface GuardianAssessment {
  risk: GuardianRisk;
  authorization: GuardianAuthorization;
  outcome: GuardianOutcome;
  rationale: string;
  source: 'rule' | 'model';
  durationMs: number;
}

export interface GuardianContext {
  workspace: string;
  mode: string;
  trust: 'trusted' | 'untrusted';
}

export interface Guardian {
  review(action: Action, context: GuardianContext): Promise<GuardianAssessment>;
}

export class RuleBasedGuardian implements Guardian {
  async review(action: Action, context: GuardianContext): Promise<GuardianAssessment> {
    const started = Date.now();
    let risk: GuardianRisk = 'low';
    let authorization: GuardianAuthorization = 'unknown';
    let outcome: GuardianOutcome = 'allow';
    let rationale = 'routine action';

    if (action.kind === 'memory' || action.kind === 'kb') {
      risk = 'low';
      rationale = 'memory/knowledge operation';
    } else if (action.kind === 'read') {
      if (!pathInside(context.workspace, action.path ?? '.')) {
        risk = 'medium';
        rationale = 'read outside workspace';
      }
    } else if (action.kind === 'write') {
      if (!pathInside(context.workspace, action.path ?? '.')) {
        risk = 'high';
        outcome = 'deny';
        rationale = 'write outside workspace';
      } else if (context.mode === 'read-only') {
        risk = 'high';
        outcome = 'deny';
        rationale = 'write in read-only mode';
      } else {
        risk = 'low';
        rationale = 'write inside workspace';
      }
    } else if (action.kind === 'exec') {
      const command = action.command ?? '';
      if (isDangerousCommand(command)) {
        risk = 'critical';
        outcome = 'deny';
        rationale = 'dangerous command';
      } else if (isSafeCommand(command)) {
        risk = 'low';
        authorization = 'medium';
        rationale = 'safe command allowlist';
      } else if (context.trust === 'untrusted') {
        risk = 'high';
        authorization = 'unknown';
        outcome = 'deny';
        rationale = 'untrusted project exec';
      } else {
        risk = 'medium';
        authorization = 'unknown';
        rationale = 'exec requires user authorization';
      }
    }

    if (risk === 'critical') outcome = 'deny';
    if (risk === 'high' && authorization === 'unknown') outcome = 'deny';

    return {
      risk,
      authorization,
      outcome,
      rationale,
      source: 'rule',
      durationMs: Date.now() - started
    };
  }
}

export class GuardianCircuitBreaker {
  private consecutive = 0;
  private recent: boolean[] = [];
  readonly maxConsecutive: number;
  readonly window: number;
  readonly maxRecent: number;

  constructor(maxConsecutive = 3, window = 50, maxRecent = 10) {
    this.maxConsecutive = maxConsecutive;
    this.window = window;
    this.maxRecent = maxRecent;
  }

  record(denied: boolean): { interrupt: boolean; consecutive: number; recentDenials: number } {
    this.consecutive = denied ? this.consecutive + 1 : 0;
    this.recent.push(denied);
    if (this.recent.length > this.window) this.recent.shift();
    const recentDenials = this.recent.filter(Boolean).length;
    return {
      interrupt: this.consecutive >= this.maxConsecutive || recentDenials >= this.maxRecent,
      consecutive: this.consecutive,
      recentDenials
    };
  }

  reset(): void {
    this.consecutive = 0;
    this.recent = [];
  }
}

export type GuardianMode = 'shadow' | 'enforce';

export interface GuardianServiceOptions {
  guardian?: Guardian;
  mode?: GuardianMode;
  onAssessment?: (assessment: GuardianAssessment, action: Action) => void;
  onInterrupt?: (info: { consecutive: number; recentDenials: number }, action: Action) => void;
}

export class GuardianService {
  readonly guardian: Guardian;
  readonly mode: GuardianMode;
  readonly breaker = new GuardianCircuitBreaker();
  private readonly onAssessment?: GuardianServiceOptions['onAssessment'];
  private readonly onInterrupt?: GuardianServiceOptions['onInterrupt'];

  constructor(opts: GuardianServiceOptions = {}) {
    this.guardian = opts.guardian ?? new RuleBasedGuardian();
    this.mode = opts.mode ?? 'shadow';
    this.onAssessment = opts.onAssessment;
    this.onInterrupt = opts.onInterrupt;
  }

  async review(action: Action, context: GuardianContext): Promise<GuardianAssessment> {
    const assessment = await this.guardian.review(action, context);
    this.onAssessment?.(assessment, action);
    if (assessment.outcome === 'deny') {
      const info = this.breaker.record(true);
      if (info.interrupt) this.onInterrupt?.(info, action);
    } else {
      this.breaker.record(false);
    }
    return assessment;
  }
}
