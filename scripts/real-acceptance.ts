import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '../src/core/session.ts';
import { WorkspaceGuard, ShellSandbox } from '../src/core/sandbox.ts';
import { PolicyEngine, ApprovalService } from '../src/core/permissions.ts';
import { GuardianService, RuleBasedGuardian } from '../src/core/guardian.ts';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { LocalDocsProvider } from '../src/core/kb.ts';
import { OpenAICompatibleModel } from '../src/core/model.ts';
import { AgentLoop } from '../src/core/agent.ts';
import type { ToolContext } from '../src/core/tools.ts';

async function main(): Promise<void> {
  const apiKey = process.env.WEFT_MODEL_API_KEY;
  if (!apiKey) throw new Error('WEFT_MODEL_API_KEY is required');
  const baseUrl = process.env.WEFT_MODEL_BASE_URL ?? 'https://api.deepseek.com/v1';
  const modelName = process.env.WEFT_MODEL ?? 'deepseek-chat';
  const workspace = mkdtempSync(join(tmpdir(), 'weft-real-acceptance-'));
  writeFileSync(join(workspace, 'README.md'), '# Weft Acceptance\nThis project verifies a real model-driven agent with tools, memory, and sandboxing.\n', 'utf8');

  const session = new Session(workspace);
  session.append('session/created', { workspace, kind: 'real-acceptance', model: modelName });
  const guard = new WorkspaceGuard(workspace);
  const policy = new PolicyEngine({ workspace, mode: 'workspace-write', approvalPolicy: 'on-request' });
  const approvals = new ApprovalService(policy, async () => 'allow-session');
  const guardian = new GuardianService({ guardian: new RuleBasedGuardian(), mode: 'shadow' });
  const sandbox = new ShellSandbox(guard, 'workspace-write');
  const memory = new SqliteMemoryProvider(join(workspace, '.weft', 'memory.db'));
  const kb = new LocalDocsProvider([workspace]);
  const scope = { tenantId: 'local', userId: 'default', projectId: 'weft' };
  const toolContext: ToolContext = { session, guard, sandbox, approvals, memory, kb, guardian, scope, workspace };
  const model = new OpenAICompatibleModel({ baseUrl, apiKey, model: modelName });
  const agent = new AgentLoop({ model, session, toolContext, maxSteps: 10, memory: { provider: memory, scope } });

  try {
    const result = await agent.run([
      'Read README.md.',
      'Then create result.txt containing a one-line summary of README.',
      'Then run node -e "console.log(String(2+2))" to verify the shell.',
      'Then write one memory record that real-model acceptance passed.',
      'Finally answer with what you did and the verification result.'
    ].join(' '));
    const toolResults = session.events().filter((event) => event.type === 'tool/result');
    const target = join(workspace, 'result.txt');
    console.log('REAL MODEL ACCEPTANCE');
    console.log('  model=' + modelName);
    console.log('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheReadTokens=' + result.cacheReadTokens + ' cacheStable=' + result.cacheReused);
    console.log('  result.txt=' + (existsSync(target) ? JSON.stringify(readFileSync(target, 'utf8').trim()) : 'MISSING'));
    console.log('  tools=' + toolResults.map((event) => {
      const data = event.data as { name?: string; ok?: boolean };
      return (data.name ?? '?') + ':' + (data.ok ? 'ok' : 'fail');
    }).join(','));
    console.log('  answer=' + result.content.slice(0, 500));
    if (!existsSync(target)) process.exitCode = 1;
  } finally {
    memory.close();
  }
}

main().catch((error) => {
  console.error('REAL MODEL ACCEPTANCE FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
