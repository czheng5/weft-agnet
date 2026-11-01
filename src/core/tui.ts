import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { renderBanner } from '../../brand/tui-banner.mjs';
import type { AgentLoop } from './agent.ts';
import type { ModelProvider } from './model.ts';
import type { Session } from './session.ts';
import type { ToolContext } from './tools.ts';
import { WorkGraph, WorkGraphStore } from './workgraph.ts';

export interface TuiOptions {
  session: Session;
  toolContext: ToolContext;
  model: ModelProvider;
  workspace: string;
}

export class Tui {
  private readonly rl = createInterface({ input: stdin, output: stdout });
  private readonly opts: TuiOptions;
  private readonly wgStore: WorkGraphStore;
  private graph: WorkGraph | null;

  constructor(opts: TuiOptions) {
    this.opts = opts;
    this.wgStore = new WorkGraphStore(opts.workspace);
    this.graph = this.wgStore.load();
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
        stdout.write('  /status  show runtime state\n  /plan  show Work Graph/plan\n  /goal <text>  create goal\n  /task <title>  add task\n  /tasks  list tasks\n  /start <id>  start task\n  /done <id> [result]  complete task\n  /events  last events\n  /memory <q>  search memory\n  /kb <q>  search knowledge base\n  /demo  run scripted M0 demo\n  /quit  exit\n');
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
        if (this.graph) {
          stdout.write('  goal: ' + this.graph.goal.text + ' [' + this.graph.goal.status + ']\n');
          for (const task of this.graph.allTasks()) {
            const deps = task.dependsOn.length > 0 ? ' <- ' + task.dependsOn.map((d) => d.slice(0, 8)).join(',') : '';
            stdout.write('  ' + task.status.padEnd(11) + ' ' + task.id.slice(0, 8) + '  ' + task.title + deps + '\n');
          }
        } else {
          stdout.write('  no Work Graph yet; /goal <text> to create one\n');
        }
        continue;
      }
      if (line.startsWith('/goal ')) {
        this.graph = new WorkGraph(line.slice(6));
        this.wgStore.save(this.graph);
        this.opts.session.append('workgraph/created', { goal: this.graph.goal });
        stdout.write('  goal ' + this.graph.goal.id.slice(0, 8) + ' created\n');
        continue;
      }
      if (line.startsWith('/task ')) {
        if (!this.graph) { stdout.write('  create a goal first: /goal <text>\n'); continue; }
        const task = this.graph.addTask({ title: line.slice(6) });
        this.wgStore.save(this.graph);
        this.opts.session.append('workgraph/task_added', { task });
        stdout.write('  task ' + task.id.slice(0, 8) + ' added\n');
        continue;
      }
      if (line === '/tasks') {
        if (!this.graph) { stdout.write('  no Work Graph\n'); continue; }
        const ready = new Set(this.graph.nextReady().map((t) => t.id));
        for (const task of this.graph.allTasks()) {
          stdout.write('  ' + task.status.padEnd(11) + ' ' + task.id.slice(0, 8) + '  ' + task.title + (ready.has(task.id) ? '  READY' : '') + '\n');
        }
        continue;
      }
      if (line.startsWith('/start ') || line.startsWith('/done ')) {
        if (!this.graph) { stdout.write('  no Work Graph\n'); continue; }
        const done = line.startsWith('/done ');
        const rest = line.slice(done ? 6 : 7).trim();
        const space = rest.indexOf(' ');
        const prefix = space >= 0 ? rest.slice(0, space) : rest;
        const result = space >= 0 ? rest.slice(space + 1) : undefined;
        const matches = this.graph.allTasks().filter((t) => t.id === prefix || t.id.startsWith(prefix));
        if (matches.length !== 1) { stdout.write('  task prefix matches ' + matches.length + ' tasks\n'); continue; }
        const task = done ? this.graph.completeTask(matches[0].id, result) : this.graph.startTask(matches[0].id);
        this.wgStore.save(this.graph);
        this.opts.session.append(done ? 'workgraph/task_done' : 'workgraph/task_started', { task });
        stdout.write('  ' + task.id.slice(0, 8) + ' -> ' + task.status + '\n');
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
        const agent = new AgentLoop({ model: new ScriptedModel(), session: this.opts.session, toolContext: this.opts.toolContext, memory: { provider: this.opts.toolContext.memory, scope: this.opts.toolContext.scope } });
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
      const agent = new AgentLoop({ model: this.opts.model, session: this.opts.session, toolContext: this.opts.toolContext, memory: { provider: this.opts.toolContext.memory, scope: this.opts.toolContext.scope } });
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
