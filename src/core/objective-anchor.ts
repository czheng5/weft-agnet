export type GuardActionKind = 'read' | 'write' | 'exec' | 'network';

export interface GuardAction {
  kind: GuardActionKind;
  path?: string;
  command?: string;
  label?: string;
}

export interface ObjectiveContract {
  id: string;
  objective: string;
  acceptance: string[];
  allowedPaths: string[];
  offline?: boolean;
  maxSteps?: number;
  maxToolCalls?: number;
  maxFailedAttempts?: number;
  allowDependencyInstall?: boolean;
}

export interface AnchorState {
  id: string;
  objective: string;
  steps: number;
  toolCalls: number;
  failures: number;
  lastFailure?: string;
  blocked: boolean;
  blockedReason?: string;
}

export class DriftError extends Error {
  readonly code: 'scope-drift' | 'offline-boundary' | 'unplanned-dependency' | 'rabbit-hole' | 'budget' | 'acceptance-missing';
  constructor(code: DriftError['code'], message: string) {
    super('objective anchor: ' + message);
    this.name = 'DriftError';
    this.code = code;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function pathAllowed(path: string, allowed: string[]): boolean {
  const target = normalizePath(path);
  return allowed.some((entry) => {
    const prefix = normalizePath(entry);
    return prefix === '*' || target === prefix || target.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');
  });
}

const NETWORK_COMMAND = /\b(curl|wget|ssh|scp|git\s+push|npm\s+publish|pnpm\s+publish)\b/i;
const DEPENDENCY_COMMAND = /\b(npm\s+(install|i)|pnpm\s+(add|install)|yarn\s+add|pip\s+install|cargo\s+add|apt(-get)?\s+install|brew\s+install)\b/i;

export class ObjectiveAnchor {
  readonly contract: ObjectiveContract;
  private steps = 0;
  private toolCalls = 0;
  private failures = 0;
  private failureCounts = new Map<string, number>();
  private lastFailure?: string;
  private blockedReason?: string;

  constructor(contract: ObjectiveContract) {
    if (!contract.id.trim() || !contract.objective.trim()) throw new Error('anchor id/objective required');
    if (!Array.isArray(contract.acceptance) || contract.acceptance.length === 0) throw new Error('anchor acceptance required');
    if (!Array.isArray(contract.allowedPaths) || contract.allowedPaths.length === 0) throw new Error('anchor allowedPaths required');
    this.contract = contract;
  }

  check(action: GuardAction): void {
    if (this.blockedReason) throw new DriftError('rabbit-hole', this.blockedReason);
    if (this.contract.maxSteps !== undefined && this.steps >= this.contract.maxSteps) {
      this.blockedReason = 'step budget exhausted (' + this.steps + '/' + this.contract.maxSteps + ')';
      throw new DriftError('budget', this.blockedReason);
    }
    if (this.contract.maxToolCalls !== undefined && this.toolCalls >= this.contract.maxToolCalls) {
      this.blockedReason = 'tool-call budget exhausted (' + this.toolCalls + '/' + this.contract.maxToolCalls + ')';
      throw new DriftError('budget', this.blockedReason);
    }
    if (action.kind === 'network' && this.contract.offline) {
      this.blockedReason = 'network action in offline contract';
      throw new DriftError('offline-boundary', this.blockedReason);
    }
    if (this.contract.offline && action.kind === 'exec' && action.command && NETWORK_COMMAND.test(action.command)) {
      this.blockedReason = 'network command in offline contract: ' + action.command;
      throw new DriftError('offline-boundary', this.blockedReason);
    }
    if (action.kind === 'exec' && action.command && !this.contract.allowDependencyInstall && DEPENDENCY_COMMAND.test(action.command)) {
      this.blockedReason = 'unplanned dependency install: ' + action.command;
      throw new DriftError('unplanned-dependency', this.blockedReason);
    }
    if ((action.kind === 'read' || action.kind === 'write') && action.path && !pathAllowed(action.path, this.contract.allowedPaths)) {
      this.blockedReason = 'path outside objective scope: ' + action.path;
      throw new DriftError('scope-drift', this.blockedReason);
    }
  }

  record(action: GuardAction, ok: boolean): void {
    this.steps += 1;
    if (action.kind === 'exec' || action.kind === 'write') this.toolCalls += 1;
    if (!ok) {
      const signature = action.kind + ':' + (action.path ?? action.command ?? action.label ?? 'unknown');
      const count = (this.failureCounts.get(signature) ?? 0) + 1;
      this.failureCounts.set(signature, count);
      this.failures += 1;
      this.lastFailure = signature;
      const max = this.contract.maxFailedAttempts ?? 2;
      if (count >= max) {
        this.blockedReason = 'rabbit-hole: ' + signature + ' failed ' + count + ' times';
      }
    }
  }

  snapshot(): AnchorState {
    return {
      id: this.contract.id,
      objective: this.contract.objective,
      steps: this.steps,
      toolCalls: this.toolCalls,
      failures: this.failures,
      lastFailure: this.lastFailure,
      blocked: Boolean(this.blockedReason),
      blockedReason: this.blockedReason
    };
  }
}
