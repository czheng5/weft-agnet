export type CuaAccess = 'allow' | 'deny' | 'ask';

export interface CuaPolicyConfig {
  defaultAccess: CuaAccess;
  apps: Record<string, CuaAccess>;
  sensitiveApps: string[];
  allowLockedScreen: boolean;
  persistentApproval: boolean;
}

export interface CuaAction {
  appId: string;
  appName?: string;
  action: 'launch' | 'click' | 'type' | 'read_screen';
  locked: boolean;
}

export interface CuaDecision {
  access: CuaAccess;
  reason: string;
  requiresHuman: boolean;
  persistent: boolean;
}

export const DEFAULT_CUA_POLICY: CuaPolicyConfig = {
  defaultAccess: 'ask',
  apps: {},
  sensitiveApps: ['1password', 'bitwarden', 'banking', 'wallet', 'settings', 'terminal'],
  allowLockedScreen: false,
  persistentApproval: false
};

export class CuaGuard {
  readonly policy: CuaPolicyConfig;

  constructor(policy: Partial<CuaPolicyConfig> = {}) {
    this.policy = { ...DEFAULT_CUA_POLICY, ...policy, apps: { ...DEFAULT_CUA_POLICY.apps, ...(policy.apps ?? {}) } };
  }

  evaluate(action: CuaAction): CuaDecision {
    if (action.locked && !this.policy.allowLockedScreen) {
      return { access: 'deny', reason: 'locked screen is not allowed', requiresHuman: false, persistent: false };
    }
    const sensitive = this.policy.sensitiveApps.some((app) => action.appId.toLowerCase().includes(app));
    if (sensitive && this.policy.apps[action.appId] !== 'allow') {
      return { access: 'deny', reason: 'sensitive application requires explicit allow', requiresHuman: true, persistent: false };
    }
    const access = this.policy.apps[action.appId] ?? this.policy.defaultAccess;
    if (access === 'allow') {
      return { access, reason: 'application allowlist', requiresHuman: false, persistent: this.policy.persistentApproval };
    }
    if (access === 'deny') {
      return { access, reason: 'application denylist', requiresHuman: false, persistent: false };
    }
    return { access, reason: 'application requires approval', requiresHuman: true, persistent: this.policy.persistentApproval };
  }
}
