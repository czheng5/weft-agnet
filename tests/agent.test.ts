import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '../src/core/session.ts';
import { WorkspaceGuard, ShellSandbox } from '../src/core/sandbox.ts';
import { PolicyEngine, ApprovalService } from '../src/core/permissions.ts';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { LocalDocsProvider } from '../src/core/kb.ts';
import { ScriptedModel } from '../src/core/model.ts';
import { AgentLoop } from '../src/core/agent.ts';
import type { ToolContext } from '../src/core/tools.ts';

test('M0 demo: file, shell, memory, KB, cache stability', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'weft-agent-'));
  let memory: SqliteMemoryProvider | undefined;
  try {
    mkdirSync(join(workspace, 'docs'), { recursive: true });
    writeFileSync(join(workspace, 'docs', 'prd.md'), '# Weft memory PRD\nMemoryHub and KnowledgeBaseProvider.', 'utf8');
    const session = new Session(workspace);
    session.append('session/created', { workspace });
    const guard = new WorkspaceGuard(workspace);
    const policy = new PolicyEngine({ workspace, mode: 'workspace-write', approvalPolicy: 'on-request' });
    const approvals = new ApprovalService(policy, async () => 'allow-session');
    const sandbox = new ShellSandbox(guard, 'workspace-write');
    memory = new SqliteMemoryProvider(join(workspace, '.weft', 'memory.db'));
    const kb = new LocalDocsProvider([join(workspace, 'docs')]);
    const toolContext: ToolContext = {
      session, guard, sandbox, approvals, memory, kb,
      scope: { tenantId: 'local', userId: 'default', projectId: 'weft' },
      workspace
    };
    const agent = new AgentLoop({ model: new ScriptedModel(), session, toolContext });
    const result = await agent.run('M0 demo: write, verify, remember, search.');
    assert.match(result.content, /M0 complete/);
    assert.equal(result.toolCalls, 6);
    assert.equal(existsSync(join(workspace, 'demo', 'weft-m0.txt')), true);
    assert.match(readFileSync(join(workspace, 'demo', 'weft-m0.txt'), 'utf8'), /Weft M0/);
    const hits = await memory.search({ text: 'M0 demo', scope: { tenantId: 'local', userId: 'default', projectId: 'weft' } });
    assert.equal(hits.length >= 1, true);
    const frozen = session.events().filter((e) => e.type === 'request/frozen') as Array<{ data: { cachePrefixStable: boolean } }>;
    assert.equal(frozen.length, 7);
    assert.equal(frozen.slice(1).every((e) => e.data.cachePrefixStable), true);
  } finally {
    memory?.close();
    rmSync(workspace, { recursive: true, force: true });
  }
});
