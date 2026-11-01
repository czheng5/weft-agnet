import type { MemoryHit, MemoryProvider, MemoryRecord, WriteReceipt } from './memory.ts';

export type ConflictResolution = 'new-wins' | 'manual' | 'keep-both';

export interface ConsolidationPolicy {
  minScore: number;
  maxCandidates: number;
  resolution: ConflictResolution;
}

export interface ConsolidationResult {
  action: 'new' | 'duplicate' | 'superseded' | 'conflict';
  candidateId: string;
  supersededIds: string[];
  written: WriteReceipt[];
  reason: string;
}

const DEFAULT_POLICY: ConsolidationPolicy = {
  minScore: 0.6,
  maxCandidates: 8,
  resolution: 'new-wins'
};

function sameScope(a: MemoryRecord['scope'], b: MemoryRecord['scope']): boolean {
  return a.tenantId === b.tenantId
    && (a.userId ?? '') === (b.userId ?? '')
    && (a.projectId ?? '') === (b.projectId ?? '')
    && (a.sessionId ?? '') === (b.sessionId ?? '');
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export class MemoryConsolidator {
  readonly provider: MemoryProvider;
  readonly policy: ConsolidationPolicy;

  constructor(provider: MemoryProvider, policy: Partial<ConsolidationPolicy> = {}) {
    this.provider = provider;
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  async consolidate(candidate: MemoryRecord): Promise<ConsolidationResult> {
    if (!candidate.content.trim()) throw new Error('candidate content is empty');
    const hits = await this.provider.search({
      text: candidate.content,
      scope: candidate.scope,
      topK: this.policy.maxCandidates,
      minConfidence: 0
    });
    const related = hits.filter((hit) => hit.record.id !== candidate.id
      && hit.record.status !== 'deleted'
      && sameScope(hit.record.scope, candidate.scope)
      && hit.record.kind === candidate.kind
      && hit.score >= this.policy.minScore);

    const duplicate = related.find((hit) => normalize(hit.record.content) === normalize(candidate.content));
    if (duplicate) {
      return {
        action: 'duplicate',
        candidateId: candidate.id,
        supersededIds: [],
        written: [],
        reason: 'same content already exists: ' + duplicate.record.id
      };
    }

    if (related.length > 0 && this.policy.resolution === 'manual') {
      return {
        action: 'conflict',
        candidateId: candidate.id,
        supersededIds: [],
        written: [],
        reason: 'conflict with ' + related.map((h) => h.record.id).join(',') + '; manual review required'
      };
    }

    const now = Date.now();
    const updates: MemoryRecord[] = [];
    if (related.length > 0 && this.policy.resolution === 'new-wins') {
      for (const hit of related) {
        updates.push({
          ...hit.record,
          status: 'contested',
          supersededBy: candidate.id,
          version: hit.record.version + 1,
          updatedAt: now
        });
      }
    }

    const written = await this.provider.write([candidate, ...updates]);
    const candidateReceipt = written.find((receipt) => receipt.id === candidate.id);
    if (candidateReceipt?.status === 'rejected') {
      return {
        action: 'conflict',
        candidateId: candidate.id,
        supersededIds: [],
        written,
        reason: 'candidate rejected: ' + (candidateReceipt.reason ?? 'unknown')
      };
    }

    return {
      action: related.length > 0 ? (this.policy.resolution === 'keep-both' ? 'conflict' : 'superseded') : 'new',
      candidateId: candidate.id,
      supersededIds: updates.map((record) => record.id),
      written,
      reason: related.length > 0
        ? 'conflict resolved with ' + related.length + ' related record(s) using ' + this.policy.resolution
        : 'no related record above threshold'
    };
  }
}
