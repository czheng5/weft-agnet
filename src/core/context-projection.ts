import type { ModelMessage } from './session.ts';

export interface ProjectionPolicy {
  maxMessages: number;
  preserveRecent: number;
  maxSummaryChars: number;
}

export interface ProjectedContext {
  messages: ModelMessage[];
  summary: string;
  dropped: ModelMessage[];
  original: ModelMessage[];
  compacted: boolean;
}

const DEFAULT_POLICY: ProjectionPolicy = {
  maxMessages: 20,
  preserveRecent: 8,
  maxSummaryChars: 1200
};

function textOf(message: ModelMessage): string {
  return message.content.replace(/\s+/g, ' ').trim();
}

export class ContextProjector {
  project(messages: ModelMessage[], policy: Partial<ProjectionPolicy> = {}): ProjectedContext {
    const config: ProjectionPolicy = {
      maxMessages: policy.maxMessages ?? DEFAULT_POLICY.maxMessages,
      preserveRecent: policy.preserveRecent ?? DEFAULT_POLICY.preserveRecent,
      maxSummaryChars: policy.maxSummaryChars ?? DEFAULT_POLICY.maxSummaryChars
    };
    const original = messages.map((message) => ({ ...message, toolCalls: message.toolCalls ? [...message.toolCalls] : undefined }));
    if (messages.length <= config.maxMessages) {
      return { messages: original, summary: '', dropped: [], original, compacted: false };
    }

    const systems = messages.filter((message) => message.role === 'system');
    const nonSystem = messages.filter((message) => message.role !== 'system');
    const preserve = Math.max(1, Math.min(config.preserveRecent, config.maxMessages - systems.length));
    const recent = nonSystem.slice(-preserve);
    const dropped = nonSystem.slice(0, Math.max(0, nonSystem.length - preserve));
    const summaryText = dropped.map((message) => message.role + ': ' + textOf(message)).join('\n');
    const summary = summaryText.length > config.maxSummaryChars
      ? summaryText.slice(0, config.maxSummaryChars - 3) + '...'
      : summaryText;
    const summaryMessage: ModelMessage = {
      role: 'system',
      content: 'Earlier context summary (shadow projection; originals retained):\n' + summary
    };
    return {
      messages: [...systems, summaryMessage, ...recent],
      summary,
      dropped,
      original,
      compacted: true
    };
  }

  restore(projected: ProjectedContext): ModelMessage[] {
    return projected.original.map((message) => ({ ...message, toolCalls: message.toolCalls ? [...message.toolCalls] : undefined }));
  }
}
