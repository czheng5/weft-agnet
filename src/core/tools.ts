import { newId } from './ids.ts';
import type { Session } from './session.ts';
import type { WorkspaceGuard, ShellRunner } from './sandbox.ts';
import type { ApprovalService } from './permissions.ts';
import type { MemoryProvider, MemoryScope, MemoryRecord } from './memory.ts';
import type { KnowledgeBaseProvider } from './kb.ts';
import type { GuardianService } from './guardian.ts';
import type { MemoryConsolidator } from './memory-consolidation.ts';

export interface ToolContext {
  session: Session;
  guard: WorkspaceGuard;
  sandbox: ShellRunner;
  approvals: ApprovalService;
  memory: MemoryProvider;
  memoryConsolidator?: MemoryConsolidator;
  kb: KnowledgeBaseProvider;
  guardian?: GuardianService;
  scope: MemoryScope;
  workspace: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  ok: boolean;
  content: string;
  data?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<string>;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const definitions: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a UTF-8 file inside the workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Workspace-relative path' } },
      required: ['path']
    },
    async run(ctx, args) {
      const path = String(args.path ?? '');
      return ctx.guard.readFile(path);
    }
  },
  {
    name: 'write_file',
    description: 'Write a UTF-8 file inside the workspace, creating directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative path' },
        content: { type: 'string', description: 'File content' }
      },
      required: ['path', 'content']
    },
    async run(ctx, args) {
      const path = String(args.path ?? '');
      const content = String(args.content ?? '');
      return ctx.guard.writeFile(path, content);
    }
  },
  {
    name: 'edit_file',
    description: 'Replace one exact string in a workspace file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' }
      },
      required: ['path', 'old_string', 'new_string']
    },
    async run(ctx, args) {
      const path = String(args.path ?? '');
      const oldText = String(args.old_string ?? '');
      const newText = String(args.new_string ?? '');
      const current = ctx.guard.readFile(path);
      if (!current.includes(oldText)) throw new Error('old_string not found');
      return ctx.guard.writeFile(path, current.replace(oldText, newText));
    }
  },
  {
    name: 'list_dir',
    description: 'List a directory inside the workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Workspace-relative path' } },
      required: []
    },
    async run(ctx, args) {
      return ctx.guard.listDir(String(args.path ?? '.')).join('\n');
    }
  },
  {
    name: 'run_shell',
    description: 'Run a shell command in the workspace. Subject to sandbox policy and approval.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command']
    },
    async run(ctx, args) {
      const command = String(args.command ?? '');
      const result = await ctx.sandbox.run(command);
      return JSON.stringify(result, null, 2);
    }
  },
  {
    name: 'memory_write',
    description: 'Write a durable memory record for the current user/project.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        kind: { type: 'string', description: 'fact|preference|decision|experience|skill' }
      },
      required: ['content']
    },
    async run(ctx, args) {
      const content = String(args.content ?? '');
      const kind = String(args.kind ?? 'fact') as MemoryRecord['kind'];
      const now = Date.now();
      const record: MemoryRecord = {
        id: newId('mem'),
        scope: ctx.scope,
        layer: kind === 'preference' ? 'semantic' : 'episodic',
        kind,
        content,
        provenance: 'agent_inferred',
        confidence: 0.7,
        sensitivity: 'internal',
        status: 'active',
        validFrom: now,
        version: 1,
        sourceEventIds: [ctx.session.log.sessionId],
        createdAt: now,
        updatedAt: now
      };
      if (ctx.memoryConsolidator) {
        const result = await ctx.memoryConsolidator.consolidate(record);
        return JSON.stringify(result);
      }
      const receipts = await ctx.memory.write([record]);
      return JSON.stringify(receipts[0]);
    }
  },
  {
    name: 'memory_search',
    description: 'Search durable memories for the current user/project.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, topK: { type: 'number' } },
      required: ['query']
    },
    async run(ctx, args) {
      const hits = await ctx.memory.search({
        text: String(args.query ?? ''),
        scope: ctx.scope,
        topK: Number(args.topK ?? 5)
      });
      return JSON.stringify(hits.map((h) => ({
        id: h.record.id,
        content: h.record.content,
        kind: h.record.kind,
        score: h.score
      })), null, 2);
    }
  },
  {
    name: 'kb_search',
    description: 'Search the external read-only knowledge base. Returns citations.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, topK: { type: 'number' } },
      required: ['query']
    },
    async run(ctx, args) {
      const hits = await ctx.kb.search({
        text: String(args.query ?? ''),
        scope: { tenantId: ctx.scope.tenantId, userId: ctx.scope.userId, projectId: ctx.scope.projectId },
        topK: Number(args.topK ?? 5)
      });
      return JSON.stringify(hits.map((h) => ({
        title: h.title,
        snippet: h.snippet,
        citation: h.citation,
        source: h.source,
        score: h.score
      })), null, 2);
    }
  }
];

const registry = new Map(definitions.map((d) => [d.name, d]));

export function toolSchemas(): ToolSchema[] {
  return definitions.map((d) => ({ name: d.name, description: d.description, parameters: d.parameters }));
}

function actionFor(call: ToolCall): { kind: 'read' | 'write' | 'exec' | 'memory' | 'kb'; path?: string; command?: string; reason?: string } {
  if (call.name === 'read_file' || call.name === 'list_dir') return { kind: 'read', path: String(call.arguments.path ?? '.') };
  if (call.name === 'write_file' || call.name === 'edit_file') return { kind: 'write', path: String(call.arguments.path ?? '') };
  if (call.name === 'run_shell') return { kind: 'exec', command: String(call.arguments.command ?? '') };
  if (call.name.startsWith('memory_')) return { kind: 'memory', reason: call.name };
  if (call.name.startsWith('kb_')) return { kind: 'kb', reason: call.name };
  return { kind: 'read', path: '.', reason: call.name };
}

export async function executeTool(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const definition = registry.get(call.name);
  if (!definition) {
    const result: ToolResult = { callId: call.id, name: call.name, ok: false, content: 'unknown tool: ' + call.name };
    ctx.session.append('tool/result', result);
    return result;
  }

  ctx.session.append('tool/call', { callId: call.id, name: call.name, arguments: call.arguments });
  const action = actionFor(call);
  ctx.session.append('approval/requested', { callId: call.id, action });
  const auth = await ctx.approvals.authorize(action);
  ctx.session.append('approval/decided', {
    callId: call.id,
    allowed: auth.allowed,
    reason: auth.reason,
    source: auth.source
  });
  if (!auth.allowed) {
    const denied: ToolResult = { callId: call.id, name: call.name, ok: false, content: 'denied: ' + auth.reason };
    ctx.session.append('tool/result', denied);
    return denied;
  }

  try {
    const content = await definition.run(ctx, call.arguments);
    const result: ToolResult = { callId: call.id, name: call.name, ok: true, content };
    ctx.session.append('tool/result', result);
    return result;
  } catch (error) {
    const result: ToolResult = {
      callId: call.id,
      name: call.name,
      ok: false,
      content: 'error: ' + (error instanceof Error ? error.message : String(error))
    };
    ctx.session.append('tool/result', result);
    return result;
  }
}
