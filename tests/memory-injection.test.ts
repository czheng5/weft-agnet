import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '../src/core/session.ts';
import { WorkspaceGuard, ShellSandbox } from '../src/core/sandbox.ts';
import { PolicyEngine, ApprovalService } from '../src/core/permissions.ts';
import { AgentLoop } from '../src/core/agent.ts';
import { MemoryInjector } from '../src/core/memory-injection.ts';
import type { MemoryProvider, MemoryRecord } from '../src/core/memory.ts';
import type { KnowledgeBaseProvider } from '../src/core/kb.ts';
import type { ToolContext } from '../src/core/tools.ts';

function record(): MemoryRecord {
  const now = Date.now();
  return {
    id: 'mem-1',
    scope: { tenantId: 'local', userId: 'default', projectId: 'weft' },
    layer: 'semantic',
    kind: 'preference',
    content: 'user prefers window seats',
    provenance: 'user_stated',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: [],
    createdAt: now,
    updatedAt: now
  };
}

function fakeProvider(): MemoryProvider {
  return {
    id: 'fake-memory',
    async write() { return []; },
    async search() { return [{ record: record(), score: 0.9, matchedBy: ['lexical'] }]; },
    async get() { return record(); },
    async forget() { return { accepted: 0, tombstoned: 0, propagation: 'complete' }; },
    async health() { return { ok: true }; }
  };
}

test('MemoryInjector builds scoped context and respects maxChars', async () => {
  const injector = new MemoryInjector(fakeProvider(), { maxChars: 100 });
  const injection = await injector.build('window seats', { tenantId: 'local' });
  assert.equal(injection.count, 1);
  assert.match(injection.text, /MEMORY/);
  assert.match(injection.text, /window seats/);
  assert.ok(injection.text.length <= 100);
});

test('Agent injects memory into runtime context', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'weft-inject-'));
  try {
    const session = new Session(workspace);
    const guard = new WorkspaceGuard(workspace);
    const policy = new PolicyEngine({ workspace, mode: 'workspace-write', approvalPolicy: 'never' });
    const approvals = new ApprovalService(policy, async () => 'deny');
    const sandbox = new ShellSandbox(guard, 'workspace-write');
    const memory = fakeProvider();
    const kb: KnowledgeBaseProvider = {
      id: 'fake-kb',
      async search() { return []; },
      async get() { return null; }
    };
    const toolContext: ToolContext = {
      session, guard, sandbox, approvals, memory, kb,
      scope: { tenantId: 'local', userId: 'default', projectId: 'weft' },
      workspace
    };
    const requests: Array<{ messages: Array<{ content: string }> }> = [];
    const model = {
      id: 'record',
      async complete(request: { messages: Array<{ content: string }> }) {
        requests.push(request);
        return { content: 'done', toolCalls: [] };
      }
    };
    const agent = new AgentLoop({
      model,
      session,
      toolContext,
      memory: { provider: memory, scope: { tenantId: 'local', userId: 'default', projectId: 'weft' } }
    });
    const result = await agent.run('window seats');
    assert.equal(result.memoryInjected, 1);
    assert.equal(session.events().some((e) => e.type === 'memory/injected'), true);
    assert.equal(requests[0].messages.some((m) => m.content.includes('MEMORY')), true);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
