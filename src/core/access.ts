import type { RuntimeScope } from './runtime-schema.ts';

export type Role = 'reader' | 'writer' | 'admin';

export interface Principal {
  id: string;
  token: string;
  role: Role;
  scope: RuntimeScope;
}

export interface QuotaPolicy {
  maxThreads?: number;
  maxMessagesPerThread?: number;
}

export class AccessError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AccessError';
    this.status = status;
  }
}

const RANK: Record<Role, number> = { reader: 1, writer: 2, admin: 3 };

export function assertRole(principal: Principal, minimum: Role): void {
  if (RANK[principal.role] < RANK[minimum]) {
    throw new AccessError(403, 'role ' + principal.role + ' cannot perform ' + minimum + ' action');
  }
}

export function resolvePrincipal(principals: Principal[], authorization: string | undefined): Principal | null {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  return principals.find((principal) => principal.token === token) ?? null;
}
