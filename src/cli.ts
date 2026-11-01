import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderBanner } from '../brand/tui-banner.mjs';
import { AgentLoop } from './core/agent.ts';
import { Session } from './core/session.ts';
import { WorkspaceGuard } from './core/sandbox.ts';
import { createShellRunner } from './core/sandbox-backends.ts';
import type { SandboxBackendKind } from './core/sandbox-backends.ts';
import { PolicyEngine, ApprovalService } from './core/permissions.ts';
import { GuardianService } from './core/guardian.ts';
import { SqliteMemoryProvider } from './core/memory.ts';
import { LocalDocsProvider } from './core/kb.ts';
import { ScriptedModel, OpenAICompatibleModel } from './core/model.ts';
import type { ModelProvider } from './core/model.ts';
import { Tui } from './core/tui.ts';
import type { ToolContext } from './core/tools.ts';

interface Args {
  demo: boolean;
  yes: boolean;
  workspace: string;
  mode: 'read-only' | 'workspace-write' | 'danger-full-access';
  approval: 'untrusted' | 'on-request' | 'never';
  sandbox: SandboxBackendKind;
  dockerImage?: string;
}

function parseArgs(argv: string[]): Args {
  let workspace = process.cwd();
  let mode: Args['mode'] = 'workspace-write';
  let approval: Args['approval'] = 'on-request';
  let sandbox: SandboxBackendKind = 'workspace-guard';
  let dockerImage: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace' && argv[i + 1]) { workspace = resolve(argv[++i]); }
    else if (arg === '--mode' && argv[i + 1]) { mode = argv[++i] as Args['mode']; }
    else if (arg === '--approval' && argv[i + 1]) { approval = argv[++i] as Args['approval']; }
    else if (arg === '--sandbox' && argv[i + 1]) { sandbox = argv[++i] as SandboxBackendKind; }
    else if (arg === '--docker-image' && argv[i + 1]) { dockerImage = argv[++i]; }
  }
  return {
    demo: argv.includes('--demo'),
    yes: argv.includes('--yes'),
    workspace,
    mode,
    approval,
    sandbox,
    dockerImage
  };
}

function liveModel(): ModelProvider | undefined {
  const apiKey = process.env.WEFT_MODEL_API_KEY ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return undefined;
  return new OpenAICompatibleModel({
    baseUrl: process.env.WEFT_MODEL_BASE_URL ?? 'https://api.deepseek.com/v1',
    apiKey,
    model: process.env.WEFT_MODEL ?? 'deepseek-chat'
  });
}

function summarize(session: Session): string {
  const events = session.events();
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  const parts = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => k + '=' + v);
  return 'events=' + events.length + ' [' + parts.join(', ') + ']';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workspace = args.workspace;
  const session = new Session(workspace);
  session.append('session/created', { workspace, mode: args.mode, approval: args.approval, sandbox: args.sandbox });

  const guard = new WorkspaceGuard(workspace);
  const policy = new PolicyEngine({ workspace, mode: args.mode, approvalPolicy: args.approval });
  const guardian = new GuardianService({
    mode: 'shadow',
    onAssessment: (assessment, action) => session.append('guardian/assessment', {
      actionKind: action.kind,
      actionPath: action.path,
      command: action.command,
      ...assessment
    }),
    onInterrupt: (info, action) => session.append('guardian/interrupt', { info, action })
  });
  let tui: Tui | undefined;
  const auto = args.demo || args.yes;
  const approvals = new ApprovalService(policy, async (action, reason) => {
    if (auto) return 'allow-session';
    if (!tui) return 'deny';
    return tui.approve(action, reason);
  }, guardian);
  const sandbox = await createShellRunner(args.sandbox, guard, args.mode, { dockerImage: args.dockerImage });
  const memory = new SqliteMemoryProvider(join(workspace, '.weft', 'memory.db'));
  const kbRoots = [join(workspace, 'docs'), join(workspace, 'report'), join(workspace, 'appendix')].filter((p) => existsSync(p));
  const kb = new LocalDocsProvider(kbRoots);
  const scope = { tenantId: 'local', userId: 'default', projectId: 'weft' };
  const toolContext: ToolContext = { session, guard, sandbox, approvals, memory, kb, guardian, scope, workspace };

  const model = args.demo ? new ScriptedModel() : (liveModel() ?? new ScriptedModel());

  if (args.demo) {
    const banner = renderBanner({
      version: '0.1.0',
      cwd: workspace,
      model: model.id,
      provider: 'scripted',
      sandbox: sandbox.info.backend,
      approvals: policy.ctx.approvalPolicy
    });
    process.stdout.write(banner + '\n');
    process.stdout.write('  running M0 demo...\n\n');
    const agent = new AgentLoop({ model, session, toolContext, maxSteps: 12 });
    const result = await agent.run('M0 demo: write a file, verify it with a shell command, store a memory, recall it, and search the knowledge base.');
    process.stdout.write(result.content + '\n');
    process.stdout.write('  session=' + result.sessionId + '\n');
    process.stdout.write('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheStable=' + result.cacheReused + ' cacheReadTokens=' + result.cacheReadTokens + '\n');
    process.stdout.write('  ' + summarize(session) + '\n');
    const lastRequests = session.events().filter((e) => e.type === 'request/frozen').slice(-3) as Array<{ data: { cachePrefixStable: boolean; messageCount: number } }>;
    for (const req of lastRequests) {
      process.stdout.write('  request cachePrefixStable=' + req.data.cachePrefixStable + ' messages=' + req.data.messageCount + '\n');
    }
    return;
  }

  tui = new Tui({ session, toolContext, model, workspace });
  if (model.id === 'scripted') {
    process.stdout.write('  note: no live model configured; use /demo or set WEFT_MODEL_API_KEY.\n\n');
  }
  await tui.start();
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
