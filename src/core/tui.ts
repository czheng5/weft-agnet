import { renderBanner } from '../../brand/tui-banner.mjs';
import type { AgentLoop } from './agent.ts';
import type { ModelProvider } from './model.ts';
import { OpenAICompatibleModel } from './model.ts';
import { ModelRegistry } from './model-registry.ts';
import type { ModelProfile } from './model-registry.ts';
import type { Session } from './session.ts';
import type { ToolContext } from './tools.ts';
import { WorkGraph, WorkGraphStore } from './workgraph.ts';
import { computeMetrics, formatMetrics } from './metrics.ts';
import { COMMANDS, completeCommand, hintsFor, type CommandDef } from './keymap.ts';
import { TuiInput } from './tui-input.ts';
import { renderChoiceMenu, renderCommandList, renderCommandPalette, renderKeyHelp, renderSettingsPanel, renderStatusBar } from './tui-menu.ts';

export interface TuiOptions {
  session: Session;
  toolContext: ToolContext;
  model: ModelProvider;
  workspace: string;
  modelRegistry?: ModelRegistry;
}

const VERSION = '2.5.0';

export class Tui {
  private readonly opts: TuiOptions;
  private readonly input = new TuiInput();
  private readonly modelRegistry?: ModelRegistry;
  private modelLabel: string;
  private readonly wgStore: WorkGraphStore;
  private graph: WorkGraph | null;
  private readonly history: string[] = [];
  private lastInterrupt = 0;

  constructor(opts: TuiOptions) {
    this.opts = opts;
    this.modelRegistry = opts.modelRegistry;
    this.modelLabel = opts.model.id;
    this.wgStore = new WorkGraphStore(opts.workspace);
    this.graph = this.wgStore.load();
  }

  async approve(action: { kind: string; path?: string; command?: string; reason?: string }, reason: string): Promise<'allow-once' | 'allow-session' | 'deny'> {
    const target = action.command ?? action.path ?? action.reason ?? action.kind;
    this.input.write('\n  approval required: ' + action.kind + ' ' + target + '\n');
    this.input.write('  reason: ' + reason + '\n');
    const answer = await this.input.readChoice('  approve? ', ['y', 's', 'n'], '[Y] once   [S] session   [N] no   Esc deny');
    if (answer === 's') return 'allow-session';
    if (answer === 'y') return 'allow-once';
    return 'deny';
  }

  async start(): Promise<void> {
    try {
      this.printBanner();
      let preset = '';
      while (true) {
        const result = await this.input.readLine({
          prompt: 'weft> ',
          hint: hintsFor('prompt', true),
          history: this.history,
          initialText: preset,
          complete: completeCommand
        });
        preset = '';

        if (result.action === 'eof') break;
        if (result.action === 'interrupt') {
          const now = Date.now();
          if (now - this.lastInterrupt < 1500) break;
          this.lastInterrupt = now;
          this.input.write('  Ctrl+C again to exit\n');
          continue;
        }
        if (result.action === 'cancel') continue;
        if (result.action === 'help') {
          await this.showKeys();
          continue;
        }
        if (result.action === 'palette') {
          const command = await this.showPalette();
          if (command) {
            if (command.takesArg) {
              preset = command.usage;
            } else if (!(await this.execute(command.usage))) {
              break;
            }
          }
          continue;
        }
        if (result.action === 'model') {
          await this.showModelPicker();
          continue;
        }
        if (result.action === 'settings') {
          await this.showSettings();
          continue;
        }

        const line = (result.text ?? '').trim();
        if (!line) continue;
        this.history.push(line);
        if (!(await this.execute(line))) break;
      }
    } finally {
      this.input.close();
    }
  }

  private async execute(line: string): Promise<boolean> {
    if (line === '/quit' || line === '/exit') return false;
    if (line === '/help') {
      this.printHelp();
      return true;
    }
    if (line === '/keys') {
      await this.showKeys();
      return true;
    }
    if (line === '/model') {
      await this.showModelPicker();
      return true;
    }
    if (line === '/settings') {
      await this.showSettings();
      return true;
    }
    if (line === '/menu') {
      const command = await this.showPalette();
      if (command) {
        if (command.takesArg) {
          this.input.write('  command: ' + command.usage + '\n');
        } else {
          return this.execute(command.usage);
        }
      }
      return true;
    }
    if (line === '/clear') {
      this.input.clearScreen();
      this.printCompact();
      return true;
    }
    if (line === '/status') {
      const events = this.opts.session.events();
      this.input.write('  session: ' + this.opts.session.log.sessionId + '\n');
      this.input.write('  workspace: ' + this.opts.workspace + '\n');
      this.input.write('  sandbox: ' + this.opts.toolContext.sandbox.info.backend + ' mode=' + this.opts.toolContext.sandbox.info.mode + ' osBoundary=' + this.opts.toolContext.sandbox.info.osBoundary + '\n');
      this.input.write('  approvals: ' + this.opts.toolContext.approvals.policy.ctx.approvalPolicy + ' cache=' + this.opts.toolContext.approvals.store.size() + '\n');
      this.input.write('  guardian: ' + (this.opts.toolContext.guardian?.mode ?? 'off') + '\n');
      this.input.write('  memory: ' + this.opts.toolContext.memory.id + '\n');
      this.input.write('  knowledge: ' + this.opts.toolContext.kb.id + '\n');
      const usage = events.filter((e) => e.type === 'model/usage') as Array<{ data: { cacheReadTokens?: number } }>;
      const cacheRead = usage.reduce((sum, e) => sum + (e.data.cacheReadTokens ?? 0), 0);
      this.input.write('  events: ' + events.length + '\n');
      this.input.write('  cacheReadTokens: ' + cacheRead + '\n');
      return true;
    }
    if (line === '/plan') {
      if (this.graph) {
        this.input.write('  goal: ' + this.graph.goal.text + ' [' + this.graph.goal.status + ']\n');
        for (const task of this.graph.allTasks()) {
          const deps = task.dependsOn.length > 0 ? ' <- ' + task.dependsOn.map((d) => d.slice(0, 8)).join(',') : '';
          this.input.write('  ' + task.status.padEnd(11) + ' ' + task.id.slice(0, 8) + '  ' + task.title + deps + '\n');
        }
      } else {
        this.input.write('  no Work Graph yet; /goal <text> to create one\n');
      }
      return true;
    }
    if (line.startsWith('/goal ')) {
      this.graph = new WorkGraph(line.slice(6));
      this.wgStore.save(this.graph);
      this.opts.session.append('workgraph/created', { goal: this.graph.goal });
      this.input.write('  goal ' + this.graph.goal.id.slice(0, 8) + ' created\n');
      return true;
    }
    if (line.startsWith('/task ')) {
      if (!this.graph) { this.input.write('  create a goal first: /goal <text>\n'); return true; }
      const task = this.graph.addTask({ title: line.slice(6) });
      this.wgStore.save(this.graph);
      this.opts.session.append('workgraph/task_added', { task });
      this.input.write('  task ' + task.id.slice(0, 8) + ' added\n');
      return true;
    }
    if (line === '/tasks') {
      if (!this.graph) { this.input.write('  no Work Graph\n'); return true; }
      const ready = new Set(this.graph.nextReady().map((t) => t.id));
      for (const task of this.graph.allTasks()) {
        this.input.write('  ' + task.status.padEnd(11) + ' ' + task.id.slice(0, 8) + '  ' + task.title + (ready.has(task.id) ? '  READY' : '') + '\n');
      }
      return true;
    }
    if (line.startsWith('/start ') || line.startsWith('/done ')) {
      if (!this.graph) { this.input.write('  no Work Graph\n'); return true; }
      const done = line.startsWith('/done ');
      const rest = line.slice(done ? 6 : 7).trim();
      const space = rest.indexOf(' ');
      const prefix = space >= 0 ? rest.slice(0, space) : rest;
      const result = space >= 0 ? rest.slice(space + 1) : undefined;
      const matches = this.graph.allTasks().filter((t) => t.id === prefix || t.id.startsWith(prefix));
      if (matches.length !== 1) { this.input.write('  task prefix matches ' + matches.length + ' tasks\n'); return true; }
      const task = done ? this.graph.completeTask(matches[0].id, result) : this.graph.startTask(matches[0].id);
      this.wgStore.save(this.graph);
      this.opts.session.append(done ? 'workgraph/task_done' : 'workgraph/task_started', { task });
      this.input.write('  ' + task.id.slice(0, 8) + ' -> ' + task.status + '\n');
      return true;
    }
    if (line === '/metrics') {
      this.input.write(formatMetrics(computeMetrics(this.opts.session.events())) + '\n');
      return true;
    }
    if (line === '/events') {
      const events = this.opts.session.events().slice(-12);
      for (const event of events) this.input.write('  ' + event.seq + ' ' + event.type + '\n');
      return true;
    }
    if (line.startsWith('/memory ')) {
      const hits = await this.opts.toolContext.memory.search({ text: line.slice(8), scope: this.opts.toolContext.scope, topK: 5 });
      for (const hit of hits) this.input.write('  [' + hit.score.toFixed(2) + '] ' + hit.record.content + '\n');
      return true;
    }
    if (line.startsWith('/kb ')) {
      const hits = await this.opts.toolContext.kb.search({ text: line.slice(4), scope: { tenantId: this.opts.toolContext.scope.tenantId }, topK: 5 });
      for (const hit of hits) this.input.write('  [' + hit.score.toFixed(2) + '] ' + hit.citation + ' — ' + hit.snippet.slice(0, 120) + '\n');
      return true;
    }
    if (line === '/demo') {
      const { AgentLoop } = await import('./agent.ts');
      const { ScriptedModel } = await import('./model.ts');
      const agent = new AgentLoop({ model: new ScriptedModel(), session: this.opts.session, toolContext: this.opts.toolContext, memory: { provider: this.opts.toolContext.memory, scope: this.opts.toolContext.scope } });
      const result = await agent.run('M0 demo: write a file, verify it with a shell command, store a memory, recall it, and search the knowledge base.');
      this.input.write('\n' + result.content + '\n');
      this.input.write('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheStable=' + result.cacheReused + ' cacheReadTokens=' + result.cacheReadTokens + '\n\n');
      return true;
    }
    if (line.startsWith('/')) {
      this.input.write('  unknown command: ' + line.split(/\s+/)[0] + '  ·  /help for commands  ·  Ctrl+K for the deck\n');
      return true;
    }
    if (this.opts.model.id === 'scripted') {
      this.input.write('  No live model configured. Set WEFT_MODEL_API_KEY, or use /demo.\n');
      return true;
    }
    const { AgentLoop } = await import('./agent.ts');
    const agent = new AgentLoop({ model: this.opts.model, session: this.opts.session, toolContext: this.opts.toolContext, memory: { provider: this.opts.toolContext.memory, scope: this.opts.toolContext.scope } });
    const result = await agent.run(line);
    this.input.write('\n' + result.content + '\n');
    this.input.write('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheStable=' + result.cacheReused + '\n\n');
    return true;
  }

  private get menuWidth(): number {
    return Math.max(40, Math.min(110, this.input.columns - 4));
  }

  private printBanner(): void {
    const banner = renderBanner({
      version: VERSION,
      cwd: this.opts.workspace,
      model: this.modelLabel,
      provider: this.opts.model.id === 'openai-compatible' ? 'api' : 'scripted',
      sandbox: this.opts.toolContext.sandbox.info.backend,
      approvals: this.opts.toolContext.approvals.policy.ctx.approvalPolicy
    });
    this.input.write(banner + '\n');
    this.input.write(this.input.interactive ? '\n' : '  ' + hintsFor('prompt', true) + '\n\n');
  }

  private printCompact(): void {
    this.input.write(renderStatusBar({
      version: VERSION,
      sandbox: this.opts.toolContext.sandbox.info.backend,
      approvals: this.opts.toolContext.approvals.policy.ctx.approvalPolicy,
      model: this.modelLabel
    }) + '\n');
    if (!this.input.interactive) this.input.write('  ' + hintsFor('prompt', true) + '\n\n');
  }

  private printHelp(): void {
    this.input.write(renderCommandList(COMMANDS, false, this.menuWidth) + '\n');
    this.input.write('  ' + hintsFor('prompt', true) + '\n\n');
  }

  private async showKeys(): Promise<void> {
    if (!this.input.interactive) {
      this.input.write(renderKeyHelp(undefined, false, this.menuWidth) + '\n');
      return;
    }
    this.input.enterAltScreen();
    try {
      this.input.write(renderKeyHelp(undefined, true, this.menuWidth) + '\n');
      await this.input.readKey();
    } finally {
      this.input.exitAltScreen();
    }
  }


  private async showSettings(): Promise<void> {
    if (!this.input.interactive) {
      this.printSettings();
      return;
    }
    let openModel = false;
    this.input.enterAltScreen();
    try {
      this.input.write(renderSettingsPanel({
        version: VERSION,
        cwd: this.opts.workspace,
        model: this.modelLabel,
        sandbox: this.opts.toolContext.sandbox.info.backend,
        approvals: this.opts.toolContext.approvals.policy.ctx.approvalPolicy
      }, true, this.menuWidth) + '\n');
      const key = await this.input.readKey();
      openModel = key.name === 'f2';
    } finally {
      this.input.exitAltScreen();
    }
    if (openModel) await this.showModelPicker();
  }

  private printSettings(): void {
    this.input.write('  product     WEFT 七襄\n');
    this.input.write('  version     ' + VERSION + '\n');
    this.input.write('  cwd         ' + this.opts.workspace + '\n');
    this.input.write('  model       ' + this.modelLabel + '\n');
    this.input.write('  sandbox     ' + this.opts.toolContext.sandbox.info.backend + '\n');
    this.input.write('  approvals   ' + this.opts.toolContext.approvals.policy.ctx.approvalPolicy + '\n\n');
  }

  private async showModelPicker(): Promise<void> {
    const profiles = this.modelRegistry?.list() ?? [];
    if (!this.input.interactive) {
      if (profiles.length === 0) {
        this.input.write('  no model profiles; configure WEFT_MODEL / WEFT_MODEL_BASE_URL or .weft/models.json\n');
      } else {
        for (const profile of profiles) this.input.write('  ' + profile.id + '  ' + profile.name + '  ' + profile.model + '\n');
      }
      return;
    }
    let selected = 0;
    this.input.enterAltScreen();
    try {
      if (profiles.length === 0) {
        this.input.write(renderChoiceMenu('WEFT 七襄 · MODELS', [{ label: 'no saved models', description: 'configure .weft/models.json or environment' }], 0, true, this.menuWidth) + '\n');
        await this.input.readKey();
        return;
      }
      while (true) {
        const items = profiles.map((profile) => {
          const ready = profile.kind === 'local' || !profile.apiKeyEnv || Boolean(process.env[profile.apiKeyEnv]);
          return {
            label: profile.name,
            description: profile.id + ' · ' + profile.model + (ready ? '' : ' · key missing'),
            disabled: !ready
          };
        });
        this.input.clearScreen();
        this.input.write(renderChoiceMenu('WEFT 七襄 · MODELS', items, selected, true, this.menuWidth) + '\n');
        const key = await this.input.readKey();
        if (key.name === 'escape') return;
        if (key.name === 'return' || key.name === 'enter') {
          await this.switchModel(profiles[selected]);
          return;
        }
        if (key.name === 'up') {
          selected = Math.max(0, selected - 1);
          continue;
        }
        if (key.name === 'down') {
          selected = Math.min(profiles.length - 1, selected + 1);
          continue;
        }
      }
    } finally {
      this.input.exitAltScreen();
    }
  }

  private async switchModel(profile: ModelProfile): Promise<void> {
    const envName = profile.apiKeyEnv ?? 'WEFT_MODEL_API_KEY';
    const apiKey = process.env[envName] ?? (profile.kind === 'local' ? 'local' : '');
    if (!apiKey) {
      this.printCompact();
      this.input.write('  cannot switch to ' + profile.name + ': missing env ' + envName + '\n\n');
      return;
    }
    this.opts.model = new OpenAICompatibleModel({ baseUrl: profile.baseUrl, apiKey, model: profile.model });
    this.modelLabel = profile.name;
    this.opts.session.append('model/switch', { id: profile.id, name: profile.name, model: profile.model });
    this.printCompact();
    this.input.write('  model switched to ' + profile.name + '  ·  ' + profile.model + '\n\n');
  }
  private async showPalette(): Promise<CommandDef | null> {
    if (!this.input.interactive) return null;
    let filter = '';
    let selected = 0;
    this.input.enterAltScreen();
    try {
      while (true) {
        const matches = COMMANDS.filter((command) => {
          if (!filter) return true;
          return (command.name + ' ' + command.usage + ' ' + command.description).toLowerCase().includes(filter.toLowerCase());
        });
        selected = Math.max(0, Math.min(selected, Math.max(0, matches.length - 1)));
        this.input.clearScreen();
        this.input.write(renderCommandPalette(COMMANDS, filter, selected, true, this.menuWidth) + '\n');
        const key = await this.input.readKey();
        if (key.name === 'escape') return null;
        if (key.name === 'return' || key.name === 'enter') return matches[selected] ?? null;
        if (key.name === 'up' || (key.name === 'k' && !key.ctrl)) {
          selected = Math.max(0, selected - 1);
          continue;
        }
        if (key.name === 'down' || (key.name === 'j' && !key.ctrl)) {
          selected = Math.min(Math.max(0, matches.length - 1), selected + 1);
          continue;
        }
        if (key.name === 'backspace') {
          filter = filter.slice(0, -1);
          selected = 0;
          continue;
        }
        if (key.ctrl || key.meta) continue;
        const sequence = key.sequence ?? '';
        if (sequence && !/[\x00-\x1f\x7f]/.test(sequence)) {
          filter += sequence;
          selected = 0;
        }
      }
    } finally {
      this.input.exitAltScreen();
    }
  }
}
