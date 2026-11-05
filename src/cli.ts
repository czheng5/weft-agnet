import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderBanner } from '../brand/tui-banner.mjs';
import { AgentLoop } from './core/agent.ts';
import { Session, latestSessionId } from './core/session.ts';
import { WorkspaceGuard } from './core/sandbox.ts';
import { createShellRunner } from './core/sandbox-backends.ts';
import type { SandboxBackendKind } from './core/sandbox-backends.ts';
import { PolicyEngine, ApprovalService } from './core/permissions.ts';
import { GuardianService, RuleBasedGuardian } from './core/guardian.ts';
import { ModelGuardian, GuardianShadow } from './core/guardian-model.ts';
import { SqliteMemoryProvider } from './core/memory.ts';
import { HttpMemoryProvider } from './core/memory-http.ts';
import { MemoryConsolidator } from './core/memory-consolidation.ts';
import { MemoryHub } from './core/memory-hub.ts';
import { startMemoryHubServer } from './core/memoryhub-server.ts';
import { createPostgresMemoryProvider } from './core/memory-postgres.ts';
import { LocalDocsProvider } from './core/kb.ts';
import { HttpKnowledgeBaseProvider } from './core/kb-http.ts';
import { WebKnowledgeBaseProvider } from './core/kb-web.ts';
import { McpKnowledgeBaseProvider, HttpMcpTransport } from './core/kb-mcp.ts';
import { ScriptedModel, OpenAICompatibleModel } from './core/model.ts';
import type { ModelProvider } from './core/model.ts';
import { Tui } from './core/tui.ts';
import { ModelRegistry } from './core/model-registry.ts';
import { AgentGateway } from './core/gateway.ts';
import { SqliteRuntimeStore } from './core/runtime-store-sqlite.ts';
import { loadEnvFile } from './core/env.ts';
import type { ToolContext } from './core/tools.ts';

interface Args {
  demo: boolean;
  yes: boolean;
  workspace: string;
  mode: 'read-only' | 'workspace-write' | 'danger-full-access';
  approval: 'untrusted' | 'on-request' | 'never';
  sandbox: SandboxBackendKind;
  dockerImage?: string;
  kbUrl?: string;
  kbToken?: string;
  kbKind: 'http' | 'web' | 'mcp';
  autoStartDocker: boolean;
  memoryUrl?: string;
  memoryToken?: string;
  pgUrl?: string;
  guardianMode: 'rule' | 'model';
  serveMemory: boolean;
  serveGateway: boolean;
  gatewayToken?: string;
  port: number;
  wslDistro?: string;
  wslUser?: string;
  wslMount?: string;
  modelBaseUrl?: string;
  modelName?: string;
  modelKey?: string;
  continueSession: boolean;
  resume?: string;
}

function parseArgs(argv: string[]): Args {
  let workspace = process.cwd();
  let mode: Args['mode'] = 'workspace-write';
  let approval: Args['approval'] = 'on-request';
  let approvalExplicit = false;
  let sandbox: SandboxBackendKind = 'workspace-guard';
  let dockerImage: string | undefined;
  let kbUrl: string | undefined = process.env.WEFT_KB_URL;
  let kbToken: string | undefined = process.env.WEFT_KB_TOKEN;
  let kbKind: Args['kbKind'] = (process.env.WEFT_KB_KIND as Args['kbKind']) ?? 'http';
  let autoStartDocker = true;
  let memoryUrl: string | undefined = process.env.WEFT_MEMORY_URL;
  let memoryToken: string | undefined = process.env.WEFT_MEMORY_TOKEN;
  let pgUrl: string | undefined = process.env.WEFT_PG_URL;
  let guardianMode: Args['guardianMode'] = (process.env.WEFT_GUARDIAN as Args['guardianMode']) ?? 'rule';
  let port = Number(process.env.WEFT_PORT ?? 4780);
  let wslDistro: string | undefined;
  let wslUser: string | undefined;
  let wslMount: string | undefined;
  let modelBaseUrl: string | undefined = process.env.WEFT_MODEL_BASE_URL;
  let modelName: string | undefined = process.env.WEFT_MODEL;
  let modelKey: string | undefined = process.env.WEFT_MODEL_API_KEY ?? process.env.DEEPSEEK_API_KEY;
  let continueSession = false;
  let resume: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace' && argv[i + 1]) { workspace = resolve(argv[++i]); }
    else if (arg === '--mode' && argv[i + 1]) { mode = argv[++i] as Args['mode']; }
    else if (arg === '--approval' && argv[i + 1]) { approval = argv[++i] as Args['approval']; approvalExplicit = true; }
    else if (arg === '--sandbox' && argv[i + 1]) { sandbox = argv[++i] as SandboxBackendKind; }
    else if (arg === '--docker-image' && argv[i + 1]) { dockerImage = argv[++i]; }
    else if (arg === '--kb-url' && argv[i + 1]) { kbUrl = argv[++i]; }
    else if (arg === '--kb-token' && argv[i + 1]) { kbToken = argv[++i]; }
    else if (arg === '--kb-kind' && argv[i + 1]) { kbKind = argv[++i] as Args['kbKind']; }
    else if (arg === '--no-auto-start') { autoStartDocker = false; }
    else if (arg === '--memory-url' && argv[i + 1]) { memoryUrl = argv[++i]; }
    else if (arg === '--memory-token' && argv[i + 1]) { memoryToken = argv[++i]; }
    else if (arg === '--pg-url' && argv[i + 1]) { pgUrl = argv[++i]; }
    else if (arg === '--guardian' && argv[i + 1]) { guardianMode = argv[++i] as Args['guardianMode']; }
    else if (arg === '--port' && argv[i + 1]) { port = Number(argv[++i]); }
    else if (arg === '--wsl-distro' && argv[i + 1]) { wslDistro = argv[++i]; }
    else if (arg === '--wsl-user' && argv[i + 1]) { wslUser = argv[++i]; }
    else if (arg === '--wsl-mount' && argv[i + 1]) { wslMount = argv[++i]; }
    else if (arg === '--model-base-url' && argv[i + 1]) { modelBaseUrl = argv[++i]; }
    else if (arg === '--model-name' && argv[i + 1]) { modelName = argv[++i]; }
    else if (arg === '--model-key' && argv[i + 1]) { modelKey = argv[++i]; }
    else if (arg === '--continue') { continueSession = true; }
    else if (arg === '--resume' && argv[i + 1]) { resume = argv[++i]; }
  }
  if (!approvalExplicit && (sandbox === 'docker' || sandbox === 'wsl' || sandbox === 'bwrap')) approval = 'sandboxed';
  return {
    demo: argv.includes('--demo'),
    yes: argv.includes('--yes'),
    workspace,
    mode,
    approval,
    sandbox,
    dockerImage,
    kbUrl,
    kbToken,
    kbKind,
    autoStartDocker,
    memoryUrl,
    memoryToken,
    pgUrl,
    guardianMode,
    serveMemory: argv.includes('--serve-memory'),
    serveGateway: argv.includes('--serve'),
    gatewayToken: process.env.WEFT_GATEWAY_TOKEN,
    port,
    wslDistro,
    wslUser,
    wslMount,
    modelBaseUrl,
    modelName,
    modelKey,
    continueSession,
    resume
  };
}

function liveModel(opts: { baseUrl?: string; modelName?: string; apiKey?: string } = {}): ModelProvider | undefined {
  const baseUrl = opts.baseUrl ?? process.env.WEFT_MODEL_BASE_URL;
  const apiKey = opts.apiKey ?? process.env.WEFT_MODEL_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? (baseUrl ? 'local' : undefined);
  if (!apiKey) return undefined;
  return new OpenAICompatibleModel({
    baseUrl: baseUrl ?? 'https://api.deepseek.com/v1',
    apiKey,
    model: opts.modelName ?? process.env.WEFT_MODEL ?? 'deepseek-chat'
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
  loadEnvFile(process.env.WEFT_ENV ?? '.env');
  const args = parseArgs(process.argv.slice(2));
  const workspace = args.workspace;
  const resumeId = args.resume ?? (args.continueSession ? latestSessionId(workspace) : undefined);
  const session = new Session(workspace, resumeId);
  session.append(resumeId ? 'session/resumed' : 'session/created', { workspace, mode: args.mode, approval: args.approval, sandbox: args.sandbox });

  const guard = new WorkspaceGuard(workspace);
  const policy = new PolicyEngine({ workspace, mode: args.mode, approvalPolicy: args.approval, sandboxEnforced: args.sandbox === 'docker' || args.sandbox === 'wsl' || args.sandbox === 'bwrap' });
  const model = args.demo ? new ScriptedModel() : (liveModel({ baseUrl: args.modelBaseUrl, modelName: args.modelName, apiKey: args.modelKey }) ?? new ScriptedModel());
  const ruleGuardian = new RuleBasedGuardian();
  const guardianImpl = args.guardianMode === 'model' && model.id !== 'scripted'
    ? new GuardianShadow(ruleGuardian, new ModelGuardian({ model }), (comparison) => session.append('guardian/comparison', comparison))
    : ruleGuardian;
  const guardian = new GuardianService({
    guardian: guardianImpl,
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
  const sandbox = await createShellRunner(args.sandbox, guard, args.mode, {
    dockerImage: args.dockerImage,
    autoStartDocker: args.autoStartDocker,
    onDockerEvent: (event) => session.append('sandbox/launch', event),
    wsl: { distro: args.wslDistro, user: args.wslUser, workspaceMount: args.wslMount }
  });
  const memory = args.pgUrl
    ? await createPostgresMemoryProvider({ connectionString: args.pgUrl })
    : args.memoryUrl
      ? new HttpMemoryProvider({ baseUrl: args.memoryUrl, token: args.memoryToken })
      : new SqliteMemoryProvider(join(workspace, '.weft', 'memory.db'));
  const kb = args.kbUrl
    ? args.kbKind === 'web'
      ? new WebKnowledgeBaseProvider({ urls: args.kbUrl.split(',').map((u) => u.trim()).filter(Boolean) })
      : args.kbKind === 'mcp'
        ? new McpKnowledgeBaseProvider({ transport: new HttpMcpTransport({ endpoint: args.kbUrl, token: args.kbToken }) })
        : new HttpKnowledgeBaseProvider({ baseUrl: args.kbUrl, token: args.kbToken })
    : new LocalDocsProvider([join(workspace, 'docs'), join(workspace, 'report'), join(workspace, 'appendix')].filter((p) => existsSync(p)));
  const scope = { tenantId: 'local', userId: 'default', projectId: 'weft' };
  const memoryConsolidator = new MemoryConsolidator(memory);
  const toolContext: ToolContext = { session, guard, sandbox, approvals, memory, memoryConsolidator, kb, guardian, scope, workspace };

  if (args.serveGateway) {
    const runtime = new SqliteRuntimeStore(join(workspace, '.weft', 'runtime.db'));
    const gateway = new AgentGateway({
      store: runtime,
      scope: { tenantId: 'local', projectId: 'weft', workspaceId: workspace },
      token: args.gatewayToken
    });
    const running = await gateway.start(args.port);
    process.stdout.write('gateway listening ' + running.url + '\n');
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => resolve());
      process.once('SIGTERM', () => resolve());
    });
    await gateway.close();
    runtime.close();
    return;
  }

  if (args.serveMemory) {
    const hub = new MemoryHub({ provider: memory, workspace });
    const running = await startMemoryHubServer({ provider: hub, token: args.memoryToken, port: args.port });
    process.stdout.write('memoryhub listening ' + running.url + '\n');
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => resolve());
      process.once('SIGTERM', () => resolve());
    });
    await running.close();
    await hub.close();
    return;
  }

  if (args.demo) {
    const banner = renderBanner({
      version: '2.5.0',
      cwd: workspace,
      model: model.id,
      provider: 'scripted',
      sandbox: sandbox.info.backend,
      approvals: policy.ctx.approvalPolicy
    });
    process.stdout.write(banner + '\n');
    process.stdout.write('  running M0 demo...\n\n');
    const agent = new AgentLoop({ model, session, toolContext, maxSteps: 12, memory: { provider: memory, scope } });
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

  const modelRegistry = new ModelRegistry(workspace);
  tui = new Tui({ session, toolContext, model, workspace, modelRegistry });
  if (model.id === 'scripted') {
    process.stdout.write('  note: no live model configured; use /demo or set WEFT_MODEL_API_KEY.\n\n');
  }
  await tui.start();
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
