import { newId } from './ids.ts';
import type { ModelMessage } from './session.ts';
import type { ToolSchema } from './request.ts';

export interface ModelToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ModelResponse {
  content: string;
  toolCalls: ModelToolCall[];
  usage?: ModelUsage;
}

export interface ModelRequest {
  system: string;
  tools: ToolSchema[];
  messages: ModelMessage[];
}

export interface ModelProvider {
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export class ScriptedModel implements ModelProvider {
  readonly id = 'scripted';
  private readonly steps: ModelResponse[];

  constructor(steps?: ModelResponse[]) {
    this.steps = steps ?? [
      {
        content: '',
        toolCalls: [{
          id: newId('call'),
          name: 'write_file',
          arguments: {
            path: 'demo/weft-m0.txt',
            content: 'Weft M0\npolicy-governed, cache-first, memory-growing.\n'
          }
        }]
      },
      {
        content: '',
        toolCalls: [{
          id: newId('call'),
          name: 'read_file',
          arguments: { path: 'demo/weft-m0.txt' }
        }]
      },
      {
        content: '',
        toolCalls: [{
          id: newId('call'),
          name: 'run_shell',
          arguments: { command: 'node -e "console.log(String(1+1))"' }
        }]
      },
      {
        content: '',
        toolCalls: [{
          id: newId('call'),
          name: 'memory_write',
          arguments: { content: 'M0 demo completed: wrote demo/weft-m0.txt and verified 1+1.', kind: 'experience' }
        }]
      },
      {
        content: '',
        toolCalls: [{
          id: newId('call'),
          name: 'memory_search',
          arguments: { query: 'M0 demo' }
        }]
      },
      {
        content: '',
        toolCalls: [{
          id: newId('call'),
          name: 'kb_search',
          arguments: { query: 'Weft memory PRD' }
        }]
      },
      {
        content: 'Weft M0 complete: file written, shell verified, memory stored and recalled, knowledge base searched.',
        toolCalls: []
      }
    ];
  }

  async complete(): Promise<ModelResponse> {
    const next = this.steps.shift();
    const response = next ?? { content: 'Scripted model has no more steps.', toolCalls: [] };
    return { ...response, usage: response.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } };
  }
}

export class OpenAICompatibleModel implements ModelProvider {
  readonly id = 'openai-compatible';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { baseUrl: string; apiKey: string; model: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const body = {
      model: this.model,
      messages: request.messages.map((m) => {
        if (m.role === 'tool') {
          return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: m.content,
            tool_calls: m.toolCalls.map((t) => ({
              id: t.id,
              type: 'function',
              function: { name: t.name, arguments: JSON.stringify(t.arguments) }
            }))
          };
        }
        return { role: m.role, content: m.content };
      }),
      tools: request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
      })),
      tool_choice: 'auto'
    };

    const response = await this.fetchImpl(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + this.apiKey
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('model HTTP ' + response.status + ': ' + await response.text());
    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number };
    };
    const message = json.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).map((t) => ({
      id: t.id,
      name: t.function.name,
      arguments: JSON.parse(t.function.arguments || '{}') as Record<string, unknown>
    }));
    return {
      content: message?.content ?? '',
      toolCalls,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? json.usage?.prompt_cache_hit_tokens ?? 0
      }
    };
  }
}
