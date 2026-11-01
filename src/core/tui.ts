import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { renderBanner } from '../../brand/tui-banner.mjs';
import type { AgentLoop } from './agent.ts';
import type { ModelProvider } from './model.ts';
import type { Session } from './session.ts';
import type { ToolContext } from './tools.ts';

export interface TuiOptions {
  session: Session;
  toolContext: ToolContext;
  model: ModelProvider;
  workspace: string;
}

export class Tui {
  private readonly rl = createInterface({ input: stdin, output: stdout });
  private readonly opts: TuiOptions;

  constructor(opts: TuiOptions) {
    this.opts = opts;
  }

  async approve(action: { kind: string; path?: string; command?: string; reason?: string }, reason: string): Promise<'allow-once' | 'allow-session' | 'deny'> {
    const target = action.command ?? action.path ?? action.reason ?? action.kind;
    stdout.write('\n  approval required: ' + action.kind + ' ' + target + '\n');
    stdout.write('  reason: ' + reason + '\n');
    const answer = (await this.rl.question('  approve? [y] once / [s] session / [n] no: ')).trim().toLowerCase();
    if (answer === 's') return 'allow-session';
    if (answer === 'y') return 'allow-once';
    return 'deny';
  }

  async start(): Promise<void> {
    const banner = renderBanner({
      version: '0.1.0',
      cwd: this.opts.workspace,
      model: this.opts.model.id,
      provider: this.opts.model.id === 'openai-compatible' ? 'api' : 'scripted',
      sandbox: this.opts.toolContext.sandbox.info.backend,
      approvals: this.opts.toolContext.approvals.policy.ctx.approvalPolicy
    });
    stdout.write(banner + '\n');
    stdout.write('  /help  /status  /plan  /events  /memory <q>  /kb <q>  /demo  /quit\n\n');

    try {
      while (true) {
      const line = (await this.rl.question('weft> ')).trim();
      if (!line) continue;
      if (line === '/quit' || line === '/exit') break;
      if (line === '/help') {
        stdout.write('  /status  show runtime state\n  /plan  show M0 plan\n  /events  last events\n  /memory <q>  search memory\n  /kb <q>  search knowledge base\n  /demo  run scripted M0 demo\n  /quit  exit\n');
        continue;
      }
      if (line === '/status') {
        const events = this.opts.session.events();
        stdout.write('  session: ' + this.opts.session.log.sessionId + '\n');
        stdout.write('  workspace: ' + this.opts.workspace + '\n');
        stdout.write('  sandbox: ' + this.opts.toolContext.sandbox.info.backend + ' mode=' + this.opts.toolContext.sandbox.info.mode + ' osBoundary=' + this.opts.toolContext.sandbox.info.osBoundary + '\n');
        stdout.write('  approvals: ' + this.opts.toolContext.approvals.policy.ctx.approvalPolicy + ' cache=' + this.opts.toolContext.approvals.store.size() + '\n');
        stdout.write('  guardian: ' + (this.opts.toolContext.guardian?.mode ?? 'off') + '\n');
        stdout.write('  memory: ' + this.opts.toolContext.memory.id + '\n');
        stdout.write('  knowledge: ' + this.opts.toolContext.kb.id + '\n');
        const usage = events.filter((e) => e.type === 'model/usage') as Array<{ data: { cacheReadTokens?: number } }>;
        const cacheRead = usage.reduce((sum, e) => sum + (e.data.cacheReadTokens ?? 0), 0);
        stdout.write('  events: ' + events.length + '\n');
        stdout.write('  cacheReadTokens: ' + cacheRead + '\n');
        continue;
      }
      if (line === '/plan') {
        stdout.write('  M0 plan:\n');
        stdout.write('  1. event log + request zones + frozen requests\n');
        stdout.write('  2. workspace sandbox + approval ladder + session cache\n');
        stdout.write('  3. SQLite MemoryProvider + local KnowledgeBaseProvider\n');
        stdout.write('  4. Weft TUI + demo task + cache/approval events\n');
        stdout.write('  5. tests: request, permissions, memory, KB, agent\n');
        continue;
      }
      if (line === '/events') {
        const events = this.opts.session.events().slice(-12);
        for (const event of events) stdout.write('  ' + event.seq + ' ' + event.type + '\n');
        continue;
      }
      if (line.startsWith('/memory ')) {
        const hits = await this.opts.toolContext.memory.search({ text: line.slice(8), scope: this.opts.toolContext.scope, topK: 5 });
        for (const hit of hits) stdout.write('  [' + hit.score.toFixed(2) + '] ' + hit.record.content + '\n');
        continue;
      }
      if (line.startsWith('/kb ')) {
        const hits = await this.opts.toolContext.kb.search({ text: line.slice(4), scope: { tenantId: this.opts.toolContext.scope.tenantId }, topK: 5 });
        for (const hit of hits) stdout.write('  [' + hit.score.toFixed(2) + '] ' + hit.citation + ' — ' + hit.snippet.slice(0, 120) + '\n');
        continue;
      }
      if (line === '/demo') {
        const { AgentLoop } = await import('./agent.ts');
        const { ScriptedModel } = await import('./model.ts');
        const agent = new AgentLoop({ model: new ScriptedModel(), session: this.opts.session, toolContext: this.opts.toolContext });
        const result = await agent.run('M0 demo: write a file, verify it with a shell command, store a memory, recall it, and search the knowledge base.');
        stdout.write('\n' + result.content + '\n');
        stdout.write('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheStable=' + result.cacheReused + ' cacheReadTokens=' + result.cacheReadTokens + '\n\n');
        continue;
      }
      if (this.opts.model.id === 'scripted') {
        stdout.write('  No live model configured. Set WEFT_MODEL_API_KEY, or use /demo.\n');
        continue;
      }
      const { AgentLoop } = await import('./agent.ts');
      const agent = new AgentLoop({ model: this.opts.model, session: this.opts.session, toolContext: this.opts.toolContext });
      const result = await agent.run(line);
      stdout.write('\n' + result.content + '\n');
      stdout.write('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheStable=' + result.cacheReused + '\n\n');
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
    } finally {
      this.rl.close();
    }
  }
}
