import type { ModelProvider } from './model.ts';
import type { Session } from './session.ts';
import { buildRequest, canonicalJson, runtimeContextText, sha256 } from './request.ts';
import type { ModelMessage } from './session.ts';
import type { ToolContext } from './tools.ts';
import { executeTool, toolSchemas } from './tools.ts';
import type { ToolCall } from './tools.ts';

export interface AgentOptions {
  model: ModelProvider;
  session: Session;
  toolContext: ToolContext;
  maxSteps?: number;
}

export interface AgentResult {
  content: string;
  sessionId: string;
  steps: number;
  cacheReused: number;
  toolCalls: number;
  cacheReadTokens: number;
}

const SYSTEM_PROMPT = [
  'You are Weft, a policy-governed agent harness.',
  'Operate only through the provided tools; never claim a result without tool evidence.',
  'File writes are restricted to the workspace. Shell commands are subject to approval and sandbox policy.',
  'Use memory_write for durable preferences/decisions/experience; use memory_search before assuming prior context.',
  'Use kb_search for external knowledge; knowledge results are read-only and must be cited.',
  'If a tool is denied, explain the denial and propose the smallest next step.',
  'When the task is complete, answer concisely with what changed and how it was verified.'
].join('\n');

export class AgentLoop {
  private readonly opts: AgentOptions;

  constructor(opts: AgentOptions) {
    this.opts = opts;
  }

  async run(task: string): Promise<AgentResult> {
    const session = this.opts.session;
    const maxSteps = this.opts.maxSteps ?? 12;
    session.append('turn/start', { task });
    session.append('user/message', { content: task });

    let steps = 0;
    let cacheReused = 0;
    let toolCalls = 0;
    let cacheReadTokens = 0;
    let final = '';
    let lastHistory: ModelMessage[] | undefined;
    let lastSystemHash = '';
    let lastToolsHash = '';

    for (; steps < maxSteps; steps += 1) {
      session.append('step/start', { step: steps + 1 });
      const all = session.deriveMessages();
      const first = steps === 0;
      const history = first ? all.slice(0, -1) : all;
      const instruction = first ? task : '';
      const request = buildRequest({
        system: SYSTEM_PROMPT,
        tools: toolSchemas(),
        messages: history,
        instruction,
        runtimeContext: runtimeContextText({
          cwd: this.opts.toolContext.workspace,
          sandbox: this.opts.toolContext.sandbox.info.backend + ' (' + this.opts.toolContext.sandbox.info.mode + ')',
          approvals: this.opts.toolContext.approvals.policy.ctx.approvalPolicy,
          memory: this.opts.toolContext.memory.id,
          knowledge: this.opts.toolContext.kb.id
        })
      });

      const systemToolsHash = sha256(canonicalJson({ system: request.system, tools: request.tools }));
      const appendOnly = lastHistory ? isMessagePrefix(lastHistory, history) : false;
      const reused = appendOnly && lastSystemHash === systemToolsHash && lastToolsHash === systemToolsHash;
      if (reused) cacheReused += 1;
      lastHistory = history;
      lastSystemHash = systemToolsHash;
      lastToolsHash = systemToolsHash;
      session.append('request/frozen', {
        prefixHash: request.prefixHash,
        requestHash: request.requestHash,
        systemToolsHash,
        cachePrefixStable: reused,
        cacheReused: reused,
        messageCount: request.messages.length,
        toolCount: request.tools.length
      });

      const response = await this.opts.model.complete({
        system: request.system,
        tools: request.tools,
        messages: request.messages
      });
      if (response.usage) {
        cacheReadTokens += response.usage.cacheReadTokens ?? 0;
        session.append('model/usage', response.usage);
      }
      session.append('assistant/message', {
        content: response.content,
        toolCalls: response.toolCalls
      });

      if (!response.toolCalls || response.toolCalls.length === 0) {
        final = response.content;
        session.append('step/end', { step: steps + 1 });
        break;
      }

      for (const call of response.toolCalls) {
        toolCalls += 1;
        await executeTool(toToolCall(call), this.opts.toolContext);
      }
      session.append('step/end', { step: steps + 1 });
    }

    if (!final) {
      final = 'Stopped after ' + maxSteps + ' steps without a final answer.';
    }
    session.append('turn/end', { content: final, steps, toolCalls });
    return {
      content: final,
      sessionId: session.log.sessionId,
      steps: steps + 1,
      cacheReused,
      toolCalls,
      cacheReadTokens
    };
  }
}

function toToolCall(call: { id: string; name: string; arguments: Record<string, unknown> }): ToolCall {
  return { id: call.id, name: call.name, arguments: call.arguments };
}

function isMessagePrefix(previous: ModelMessage[], next: ModelMessage[]): boolean {
  if (previous.length > next.length) return false;
  for (let i = 0; i < previous.length; i += 1) {
    if (JSON.stringify(previous[i]) !== JSON.stringify(next[i])) return false;
  }
  return true;
}

