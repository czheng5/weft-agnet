import { isAbsolute, relative, resolve } from 'node:path';
import type { GuardianService } from './guardian.ts';

export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type ApprovalPolicy = 'untrusted' | 'on-request' | 'never';
export type ActionKind = 'read' | 'write' | 'exec' | 'memory' | 'kb';

export interface Action {
  kind: ActionKind;
  path?: string;
  command?: string;
  reason?: string;
}

export type DecisionType = 'allow' | 'deny' | 'ask';

export interface Decision {
  type: DecisionType;
  reason: string;
  key: string;
}

export interface PolicyContext {
  workspace: string;
  mode: SandboxMode;
  approvalPolicy: ApprovalPolicy;
}

const DANGEROUS = [
  /\brm\s+-rf\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/s\b/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdiskpart\b/i,
  /\breg\s+delete\b/i,
  /\bremove-item\b.*-recurse/i
];

const SAFE_PREFIXES = [
  'node -e ',
  'node --version',
  'node -v',
  'git status',
  'git diff',
  'git log',
  'dir',
  'echo ',
  'type ',
  'get-childitem',
  'get-content ',
  'test-path '
];

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS.some((re) => re.test(command));
}

export function isSafeCommand(command: string): boolean {
  const lower = command.trim().toLowerCase();
  return SAFE_PREFIXES.some((p) => lower === p.trim() || lower.startsWith(p));
}

export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

export function canonicalAction(action: Action, workspace: string): string {
  if (action.kind === 'read' || action.kind === 'write') {
    const abs = resolve(workspace, action.path ?? '.');
    return action.kind + ':' + abs.replace(/\\/g, '/');
  }
  if (action.kind === 'exec') return 'exec:' + normalizeCommand(action.command ?? '');
  return action.kind + ':' + (action.reason ?? 'default');
}

export function pathInside(workspace: string, path: string): boolean {
  const rel = relative(resolve(workspace), resolve(workspace, path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export class PolicyEngine {
  readonly ctx: PolicyContext;

  constructor(ctx: PolicyContext) {
    this.ctx = ctx;
  }

  evaluate(action: Action): Decision {
    const key = canonicalAction(action, this.ctx.workspace);
    if (action.kind === 'memory' || action.kind === 'kb') {
      return { type: 'allow', reason: 'memory/knowledge operation', key };
    }

    if (action.kind === 'read') {
      if (pathInside(this.ctx.workspace, action.path ?? '.')) {
        return { type: 'allow', reason: 'read inside workspace', key };
      }
      return { type: 'ask', reason: 'read outside workspace', key };
    }

    if (action.kind === 'write') {
      if (this.ctx.mode === 'read-only') {
        return { type: 'deny', reason: 'read-only mode', key };
      }
      if (pathInside(this.ctx.workspace, action.path ?? '.')) {
        return { type: 'allow', reason: 'write inside workspace', key };
      }
      if (this.ctx.mode === 'danger-full-access') {
        return { type: 'allow', reason: 'danger-full-access', key };
      }
      return { type: 'ask', reason: 'write outside workspace', key };
    }

    const command = action.command ?? '';
    if (isDangerousCommand(command)) {
      return { type: 'deny', reason: 'dangerous command', key };
    }
    if (this.ctx.mode === 'danger-full-access') {
      return { type: 'allow', reason: 'danger-full-access', key };
    }
    if (this.ctx.mode === 'read-only') {
      return { type: 'deny', reason: 'read-only mode', key };
    }
    if (isSafeCommand(command)) {
      return { type: 'allow', reason: 'safe command allowlist', key };
    }
    if (this.ctx.approvalPolicy === 'never') {
      return { type: 'deny', reason: 'approval policy never', key };
    }
    if (this.ctx.approvalPolicy === 'untrusted') {
      return { type: 'ask', reason: 'untrusted project', key };
    }
    return { type: 'ask', reason: 'exec requires approval', key };
  }
}

export type ApprovalChoice = 'allow-once' | 'allow-session' | 'deny';

export class ApprovalStore {
  private readonly map = new Map<string, 'allow' | 'deny'>();

  get(key: string): 'allow' | 'deny' | undefined {
    return this.map.get(key);
  }

  put(key: string, value: 'allow' | 'deny'): void {
    this.map.set(key, value);
  }

  size(): number {
    return this.map.size;
  }
}

export type AskFn = (action: Action, reason: string) => Promise<ApprovalChoice>;

export class ApprovalService {
  readonly store = new ApprovalStore();
  private readonly ask: AskFn;
  readonly policy: PolicyEngine;
  private readonly guardian?: GuardianService;

  constructor(policy: PolicyEngine, ask: AskFn, guardian?: GuardianService) {
    this.policy = policy;
    this.ask = ask;
    this.guardian = guardian;
  }

  async authorize(action: Action): Promise<{ allowed: boolean; reason: string; source: string }> {
    if (this.guardian) {
      const assessment = await this.guardian.review(action, {
        workspace: this.policy.ctx.workspace,
        mode: this.policy.ctx.mode,
        trust: 'trusted'
      });
      if (this.guardian.mode === 'enforce' && assessment.outcome === 'deny') {
        return { allowed: false, reason: 'guardian: ' + assessment.rationale, source: 'guardian' };
      }
    }
    const decision = this.policy.evaluate(action);
    if (decision.type === 'allow') return { allowed: true, reason: decision.reason, source: 'policy' };
    if (decision.type === 'deny') return { allowed: false, reason: decision.reason, source: 'policy' };

    const cached = this.store.get(decision.key);
    if (cached === 'allow') return { allowed: true, reason: 'session approval cache', source: 'cache' };
    if (cached === 'deny') return { allowed: false, reason: 'session denial cache', source: 'cache' };

    const choice = await this.ask(action, decision.reason);
    if (choice === 'allow-session') {
      this.store.put(decision.key, 'allow');
      return { allowed: true, reason: 'approved for session', source: 'user' };
    }
    if (choice === 'allow-once') return { allowed: true, reason: 'approved once', source: 'user' };
    this.store.put(decision.key, 'deny');
    return { allowed: false, reason: 'denied by user', source: 'user' };
  }
}
