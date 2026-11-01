import type {
  ForgetReceipt,
  ForgetSelector,
  MemoryHit,
  MemoryProvider,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  ProviderHealth,
  WriteReceipt
} from './memory.ts';

export type MemoryAction = 'read' | 'write' | 'forget' | 'admin';
export type MemoryRole = 'viewer' | 'editor' | 'admin';

export interface MemoryPrincipal {
  tenantId: string;
  userId?: string;
  projectIds?: string[];
  role: MemoryRole;
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
}

export class MemoryAccessDenied extends Error {
  readonly action: MemoryAction;
  readonly reason: string;

  constructor(action: MemoryAction, reason: string) {
    super('memory ' + action + ' denied: ' + reason);
    this.name = 'MemoryAccessDenied';
    this.action = action;
    this.reason = reason;
  }
}

const ROLE_PERMISSIONS: Record<MemoryRole, MemoryAction[]> = {
  viewer: ['read'],
  editor: ['read', 'write'],
  admin: ['read', 'write', 'forget', 'admin']
};

export class MemoryGovernance implements MemoryProvider {
  readonly id: string;
  readonly inner: MemoryProvider;
  readonly principal: MemoryPrincipal;
  private readonly onAudit?: (event: { action: string; allowed: boolean; reason: string; scope?: MemoryScope }) => void;

  constructor(inner: MemoryProvider, principal: MemoryPrincipal, onAudit?: (event: { action: string; allowed: boolean; reason: string; scope?: MemoryScope }) => void) {
    this.inner = inner;
    this.principal = principal;
    this.id = inner.id + '+governed';
    this.onAudit = onAudit;
  }

  check(action: MemoryAction, scope: MemoryScope): AccessDecision {
    const permission = ROLE_PERMISSIONS[this.principal.role] ?? [];
    if (!permission.includes(action)) {
      return { allowed: false, reason: 'role ' + this.principal.role + ' lacks ' + action };
    }
    if (scope.tenantId !== this.principal.tenantId) {
      return { allowed: false, reason: 'tenant mismatch' };
    }
    if (this.principal.projectIds && scope.projectId && !this.principal.projectIds.includes(scope.projectId)) {
      return { allowed: false, reason: 'project not allowed' };
    }
    return { allowed: true, reason: 'role ' + this.principal.role };
  }

  private audit(action: MemoryAction, decision: AccessDecision, scope?: MemoryScope): void {
    this.onAudit?.({ action, allowed: decision.allowed, reason: decision.reason, scope });
  }

  async write(records: MemoryRecord[]): Promise<WriteReceipt[]> {
    for (const record of records) {
      const decision = this.check('write', record.scope);
      this.audit('write', decision, record.scope);
      if (!decision.allowed) throw new MemoryAccessDenied('write', decision.reason);
    }
    return this.inner.write(records);
  }

  async search(query: MemoryQuery): Promise<MemoryHit[]> {
    const decision = this.check('read', query.scope);
    this.audit('read', decision, query.scope);
    if (!decision.allowed) throw new MemoryAccessDenied('read', decision.reason);
    return this.inner.search(query);
  }

  async get(id: string, scope: MemoryScope): Promise<MemoryRecord | null> {
    const decision = this.check('read', scope);
    this.audit('read', decision, scope);
    if (!decision.allowed) throw new MemoryAccessDenied('read', decision.reason);
    return this.inner.get(id, scope);
  }

  async forget(selector: ForgetSelector): Promise<ForgetReceipt> {
    const decision = this.check('forget', selector.scope);
    this.audit('forget', decision, selector.scope);
    if (!decision.allowed) throw new MemoryAccessDenied('forget', decision.reason);
    return this.inner.forget(selector);
  }

  async health(): Promise<ProviderHealth> {
    return this.inner.health();
  }
}
