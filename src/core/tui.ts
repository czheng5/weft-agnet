import { renderBanner } from '../../brand/tui-banner.mjs';
import type { AgentLoop } from './agent.ts';
import type { ModelProvider } from './model.ts';
import { OpenAICompatibleModel } from './model.ts';
import { ModelRegistry } from './model-registry.ts';
import type { ModelProfile } from './model-registry.ts';
import type { Session } from './session.ts';
import { listSessions } from './session.ts';
import type { ToolContext } from './tools.ts';
import { WorkGraph, WorkGraphStore } from './workgraph.ts';
import { computeMetrics, formatMetrics } from './metrics.ts';
import { COMMANDS, completeCommand, hintsFor, type CommandDef } from './keymap.ts';
import { TuiInput } from './tui-input.ts';
import { fitVisible, visibleWidth, renderChoiceMenu, renderCommandList, renderCommandPalette, renderKeyHelp, renderSettingsPanel, renderStatusBar } from './tui-menu.ts';

export interface TuiOptions {
  session: Session;
  toolContext: ToolContext;
  model: ModelProvider;
  workspace: string;
  modelRegistry?: ModelRegistry;
}

const VERSION = '2.5.0';

type Panel = 'chat' | 'board' | 'events' | 'sessions' | 'actors' | 'caps';
const PANELS: Array<{ id: Panel; label: string }> = [
  { id: 'chat', label: 'CHAT' },
  { id: 'board', label: 'BOARD' },
  { id: 'events', label: 'EVENTS' },
  { id: 'sessions', label: 'SESSIONS' },
  { id: 'actors', label: 'ACTORS' },
  { id: 'caps', label: 'CAPS' }
];

export class Tui {
  private readonly opts: TuiOptions;
  private readonly input = new TuiInput();
  private readonly modelRegistry?: ModelRegistry;
  private modelLabel: string;
  private readonly wgStore: WorkGraphStore;
  private graph: WorkGraph | null;
  private readonly history: string[] = [];
  private readonly transcript: string[] = [];
  private panel: Panel = 'chat';
  private scrollOffset = 0;
  private welcome = true;
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
    this.emit('  approval required: ' + action.kind + ' ' + target);
    this.emit('  reason: ' + reason);
    this.redraw();
    const answer = await this.input.readChoice('  approve? ', ['y', 's', 'n'], '[Y] once   [S] session   [N] no   Esc deny');
    if (answer === 's') return 'allow-session';
    if (answer === 'y') return 'allow-once';
    return 'deny';
  }

  async start(): Promise<void> {
    this.input.enterAltScreen();
    try {
      this.printBanner();
      let preset = '';
      while (true) {
        const result = await this.input.readLine({
          prompt: 'weft> ',
          hint: '',
          history: this.history,
          initialText: preset,
          complete: completeCommand,
          onScroll: (direction) => {
            const max = Math.max(0, this.transcript.length - 1);
            this.scrollOffset = Math.max(0, Math.min(max, this.scrollOffset - direction * 5));
            this.redraw();
          }
        });
        preset = '';

        if (result.action === 'eof') break;
        if (result.action === 'interrupt') {
          const now = Date.now();
          if (now - this.lastInterrupt < 1500) break;
          this.lastInterrupt = now;
          this.emit('  Ctrl+C again to exit');
          this.redraw();
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
        if (result.action === 'panel') {
          this.cyclePanel();
          continue;
        }

        const line = (result.text ?? '').trim();
        if (!line) continue;
        this.history.push(line);
        if (!(await this.execute(line))) break;
        this.redraw();
      }
    } finally {
      this.input.exitAltScreen();
      this.input.close();
    }
  }

  private async execute(line: string): Promise<boolean> {
    if (line === '/quit' || line === '/exit') return false;
    if (!['/board', '/sessions', '/actors', '/caps', '/chat'].includes(line)) this.panel = 'chat';
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
          this.emit('  command: ' + command.usage + '\n');
        } else {
          return this.execute(command.usage);
        }
      }
      return true;
    }
    if (line === '/clear') {
      this.transcript.length = 0;
      this.emit('  screen cleared');
      this.redraw();
      return true;
    }
    if (line === '/sessions') {
      this.panel = 'sessions';
      this.redraw();
      return true;
    }
    if (line === '/board') {
      this.panel = 'board';
      this.redraw();
      return true;
    }
    if (line === '/actors') {
      this.panel = 'actors';
      this.redraw();
      return true;
    }
    if (line === '/caps') {
      this.panel = 'caps';
      this.redraw();
      return true;
    }
    if (line === '/chat') {
      this.panel = 'chat';
      this.redraw();
      return true;
    }
    if (line === '/status') {
      const events = this.opts.session.events();
      this.emit('  session: ' + this.opts.session.log.sessionId + '\n');
      this.emit('  workspace: ' + this.opts.workspace + '\n');
      this.emit('  sandbox: ' + this.opts.toolContext.sandbox.info.backend + ' mode=' + this.opts.toolContext.sandbox.info.mode + ' osBoundary=' + this.opts.toolContext.sandbox.info.osBoundary + '\n');
      this.emit('  approvals: ' + this.opts.toolContext.approvals.policy.ctx.approvalPolicy + ' cache=' + this.opts.toolContext.approvals.store.size() + '\n');
      this.emit('  guardian: ' + (this.opts.toolContext.guardian?.mode ?? 'off') + '\n');
      this.emit('  memory: ' + this.opts.toolContext.memory.id + '\n');
      this.emit('  knowledge: ' + this.opts.toolContext.kb.id + '\n');
      const usage = events.filter((e) => e.type === 'model/usage') as Array<{ data: { cacheReadTokens?: number } }>;
      const cacheRead = usage.reduce((sum, e) => sum + (e.data.cacheReadTokens ?? 0), 0);
      this.emit('  events: ' + events.length + '\n');
      this.emit('  cacheReadTokens: ' + cacheRead + '\n');
      return true;
    }
    if (line === '/plan') {
      if (this.graph) {
        this.emit('  goal: ' + this.graph.goal.text + ' [' + this.graph.goal.status + ']\n');
        for (const task of this.graph.allTasks()) {
          const deps = task.dependsOn.length > 0 ? ' <- ' + task.dependsOn.map((d) => d.slice(0, 8)).join(',') : '';
          this.emit('  ' + task.status.padEnd(11) + ' ' + task.id.slice(0, 8) + '  ' + task.title + deps + '\n');
        }
      } else {
        this.emit('  no Work Graph yet; /goal <text> to create one\n');
      }
      return true;
    }
    if (line.startsWith('/goal ')) {
      this.graph = new WorkGraph(line.slice(6));
      this.wgStore.save(this.graph);
      this.opts.session.append('workgraph/created', { goal: this.graph.goal });
      this.emit('  goal ' + this.graph.goal.id.slice(0, 8) + ' created\n');
      return true;
    }
    if (line.startsWith('/task ')) {
      if (!this.graph) { this.emit('  create a goal first: /goal <text>\n'); return true; }
      const task = this.graph.addTask({ title: line.slice(6) });
      this.wgStore.save(this.graph);
      this.opts.session.append('workgraph/task_added', { task });
      this.emit('  task ' + task.id.slice(0, 8) + ' added\n');
      return true;
    }
    if (line === '/tasks') {
      if (!this.graph) { this.emit('  no Work Graph\n'); return true; }
      const ready = new Set(this.graph.nextReady().map((t) => t.id));
      for (const task of this.graph.allTasks()) {
        this.emit('  ' + task.status.padEnd(11) + ' ' + task.id.slice(0, 8) + '  ' + task.title + (ready.has(task.id) ? '  READY' : '') + '\n');
      }
      return true;
    }
    if (line.startsWith('/start ') || line.startsWith('/done ')) {
      if (!this.graph) { this.emit('  no Work Graph\n'); return true; }
      const done = line.startsWith('/done ');
      const rest = line.slice(done ? 6 : 7).trim();
      const space = rest.indexOf(' ');
      const prefix = space >= 0 ? rest.slice(0, space) : rest;
      const result = space >= 0 ? rest.slice(space + 1) : undefined;
      const matches = this.graph.allTasks().filter((t) => t.id === prefix || t.id.startsWith(prefix));
      if (matches.length !== 1) { this.emit('  task prefix matches ' + matches.length + ' tasks\n'); return true; }
      const task = done ? this.graph.completeTask(matches[0].id, result) : this.graph.startTask(matches[0].id);
      this.wgStore.save(this.graph);
      this.opts.session.append(done ? 'workgraph/task_done' : 'workgraph/task_started', { task });
      this.emit('  ' + task.id.slice(0, 8) + ' -> ' + task.status + '\n');
      return true;
    }
    if (line === '/metrics') {
      this.emit(formatMetrics(computeMetrics(this.opts.session.events())) + '\n');
      return true;
    }
    if (line === '/events') {
      const events = this.opts.session.events().slice(-12);
      for (const event of events) this.emit('  ' + event.seq + ' ' + event.type + '\n');
      return true;
    }
    if (line.startsWith('/memory ')) {
      const hits = await this.opts.toolContext.memory.search({ text: line.slice(8), scope: this.opts.toolContext.scope, topK: 5 });
      for (const hit of hits) this.emit('  [' + hit.score.toFixed(2) + '] ' + hit.record.content + '\n');
      return true;
    }
    if (line.startsWith('/kb ')) {
      const hits = await this.opts.toolContext.kb.search({ text: line.slice(4), scope: { tenantId: this.opts.toolContext.scope.tenantId }, topK: 5 });
      for (const hit of hits) this.emit('  [' + hit.score.toFixed(2) + '] ' + hit.citation + ' — ' + hit.snippet.slice(0, 120) + '\n');
      return true;
    }
    if (line === '/demo') {
      const { AgentLoop } = await import('./agent.ts');
      const { ScriptedModel } = await import('./model.ts');
      const agent = new AgentLoop({ model: new ScriptedModel(), session: this.opts.session, toolContext: this.opts.toolContext, memory: { provider: this.opts.toolContext.memory, scope: this.opts.toolContext.scope } });
      const result = await agent.run('M0 demo: write a file, verify it with a shell command, store a memory, recall it, and search the knowledge base.');
      this.emit('\n' + result.content + '\n');
      this.emit('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheStable=' + result.cacheReused + ' cacheReadTokens=' + result.cacheReadTokens + '\n\n');
      return true;
    }
    if (line.startsWith('/')) {
      this.emit('  unknown command: ' + line.split(/\s+/)[0] + '  ·  /help for commands  ·  Ctrl+K for the deck\n');
      return true;
    }
    if (this.opts.model.id === 'scripted') {
      this.emit('  No live model configured. Set WEFT_MODEL_API_KEY, or use /demo.\n');
      return true;
    }
    const { AgentLoop } = await import('./agent.ts');
    const agent = new AgentLoop({ model: this.opts.model, session: this.opts.session, toolContext: this.opts.toolContext, memory: { provider: this.opts.toolContext.memory, scope: this.opts.toolContext.scope } });
    const result = await agent.run(line);
    this.emit('\n' + result.content + '\n');
    this.emit('  steps=' + result.steps + ' toolCalls=' + result.toolCalls + ' cacheStable=' + result.cacheReused + '\n\n');
    return true;
  }


  private emit(text: string): void {
    this.welcome = false;
    this.scrollOffset = 0;
    for (const line of text.split('\n')) this.transcript.push(line);
    if (this.transcript.length > 500) this.transcript.splice(0, this.transcript.length - 500);
  }

  private cyclePanel(): void {
    const index = PANELS.findIndex((item) => item.id === this.panel);
    this.panel = PANELS[(index + 1) % PANELS.length].id;
    this.scrollOffset = 0;
    this.redraw();
  }

  private panelLines(): string[] {
    if (this.panel === 'board') {
      if (!this.graph) return ['  no Work Graph yet', '  /goal <text> to create one'];
      const lines = ['  goal: ' + this.graph.goal.text + ' [' + this.graph.goal.status + ']', '']; 
      const ready = new Set(this.graph.nextReady().map((task) => task.id));
      for (const task of this.graph.allTasks()) {
        lines.push('  ' + task.status.padEnd(11) + ' ' + task.id.slice(0, 8) + '  ' + task.title + (ready.has(task.id) ? '  READY' : ''));
      }
      return lines;
    }
    if (this.panel === 'events') {
      return this.opts.session.events().slice(-24).map((event) => '  ' + String(event.seq).padStart(4) + '  ' + event.type);
    }
    if (this.panel === 'sessions') {
      const sessions = listSessions(this.opts.workspace).slice(0, 20);
      if (sessions.length === 0) return ['  no sessions yet'];
      return sessions.map((item) => '  ' + item.id + '  ' + new Date(item.updatedAt).toISOString() + '  ' + Math.ceil(item.bytes / 1024) + 'k');
    }
    if (this.panel === 'actors') {
      const events = this.opts.session.events().filter((event) => event.type.startsWith('actor/') || event.type.startsWith('thread/'));
      return events.length > 0 ? events.slice(-20).map((event) => '  ' + event.type + '  ' + JSON.stringify(event.data).slice(0, 100)) : ['  no actor activity in this session', '  ActorRuntime is available to the gateway; TUI attachment is next.'];
    }
    if (this.panel === 'caps') {
      const events = this.opts.session.events().filter((event) => event.type.startsWith('capability/'));
      return events.length > 0 ? events.slice(-20).map((event) => '  ' + event.type + '  ' + JSON.stringify(event.data).slice(0, 100)) : ['  no capability events in this session', '  CapabilityRegistry is available to the gateway; TUI attachment is next.'];
    }
    return this.transcript;
  }
  private redraw(): void {
    const rows = this.input.rows;
    const cols = this.input.columns;
    const inputRow = Math.max(5, rows - 1);
    const footerRow = rows;
    const area = Math.max(1, rows - 5);
    this.input.setLayout({ inputRow, footerRow });
    const session = this.opts.session.log.sessionId.replace(/^session-/, '').slice(0, 8);
    const top = 'WEFT 七襄  v' + VERSION + '  ·  session ' + session + '  ·  ' + this.modelLabel + '  ·  ' + this.opts.toolContext.sandbox.info.backend;
    const tabs = PANELS.map((item) => item.id === this.panel ? '\x1b[7m ' + item.label + ' \x1b[0m' : ' ' + item.label + ' ').join('  ');
    const lines: string[] = [];
    lines.push(fitVisible(top, Math.max(1, cols - 1)));
    lines.push('─'.repeat(Math.max(1, cols - 1)));
    lines.push(fitVisible(tabs, Math.max(1, cols - 1)));
    const all = this.panelLines();
    const end = Math.max(area, all.length - this.scrollOffset);
    let visible = all.slice(Math.max(0, end - area), end);
    let leftPad = 0;
    if (this.welcome && this.panel === 'chat') {
      const width = Math.max(0, ...visible.map((line) => visibleWidth(line)));
      if (width < cols - 1) leftPad = Math.floor((cols - 1 - width) / 2);
      const topPad = Math.max(0, Math.floor((area - visible.length) / 2));
      visible = [...Array(topPad).fill(''), ...visible].slice(-area);
    }
    for (let i = 0; i < area; i += 1) lines.push(fitVisible(' '.repeat(leftPad) + (visible[i] ?? ''), Math.max(1, cols - 1)));
    const footer = hintsFor('prompt', true);
    this.input.write('\x1b[2J\x1b[H' + lines.join('\n') + '\x1b[' + footerRow + ';1H\x1b[2K  \x1b[2m' + footer + '\x1b[0m' + '\x1b[' + inputRow + ';1H\x1b[2K');
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
    for (const line of banner.split('\n')) this.transcript.push(line);
    this.welcome = true;
    this.redraw();
  }

  private printCompact(): void {
    this.emit(renderStatusBar({
      version: VERSION,
      sandbox: this.opts.toolContext.sandbox.info.backend,
      approvals: this.opts.toolContext.approvals.policy.ctx.approvalPolicy,
      model: this.modelLabel
    }));
    this.redraw();
  }

  private printHelp(): void {
    this.emit(renderCommandList(COMMANDS, false, this.menuWidth));
    this.redraw();
  }

  private async showKeys(): Promise<void> {
    if (!this.input.interactive) {
      this.emit(renderKeyHelp(undefined, false, this.menuWidth));
      this.redraw();
      return;
    }
    this.input.clearScreen();
    this.input.write(renderKeyHelp(undefined, true, this.menuWidth) + '\n');
    await this.input.readKey();
    this.redraw();
  }


  private async showSettings(): Promise<void> {
    if (!this.input.interactive) {
      this.printSettings();
      return;
    }
    let openModel = false;
    this.input.clearScreen();
    this.input.write(renderSettingsPanel({
      version: VERSION,
      cwd: this.opts.workspace,
      model: this.modelLabel,
      sandbox: this.opts.toolContext.sandbox.info.backend,
      approvals: this.opts.toolContext.approvals.policy.ctx.approvalPolicy
    }, true, this.menuWidth) + '\n');
    const key = await this.input.readKey();
    openModel = key.name === 'f2';
    this.redraw();
    if (openModel) await this.showModelPicker();
  }

  private printSettings(): void {
    this.emit('  product     WEFT 七襄');
    this.emit('  version     ' + VERSION);
    this.emit('  cwd         ' + this.opts.workspace);
    this.emit('  model       ' + this.modelLabel);
    this.emit('  sandbox     ' + this.opts.toolContext.sandbox.info.backend);
    this.emit('  approvals   ' + this.opts.toolContext.approvals.policy.ctx.approvalPolicy);
    this.redraw();
  }

  private async showModelPicker(): Promise<void> {
    const profiles = this.modelRegistry?.list() ?? [];
    if (!this.input.interactive) {
      if (profiles.length === 0) {
        this.emit('  no model profiles; configure WEFT_MODEL / WEFT_MODEL_BASE_URL or .weft/models.json');
      } else {
        for (const profile of profiles) this.emit('  ' + profile.id + '  ' + profile.name + '  ' + profile.model);
      }
      this.redraw();
      return;
    }
    let selected = 0;
    if (profiles.length === 0) {
      this.input.clearScreen();
      this.input.write(renderChoiceMenu('WEFT 七襄 · MODELS', [{ label: 'no saved models', description: 'configure .weft/models.json or environment' }], 0, true, this.menuWidth) + '\n');
      await this.input.readKey();
      this.redraw();
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
      if (key.name === 'escape') break;
      if (key.name === 'return' || key.name === 'enter') {
        await this.switchModel(profiles[selected]);
        break;
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
    this.redraw();
  }

  private async switchModel(profile: ModelProfile): Promise<void> {
    const envName = profile.apiKeyEnv ?? 'WEFT_MODEL_API_KEY';
    const apiKey = process.env[envName] ?? (profile.kind === 'local' ? 'local' : '');
    if (!apiKey) {
      this.emit('  cannot switch to ' + profile.name + ': missing env ' + envName);
      this.redraw();
      return;
    }
    this.opts.model = new OpenAICompatibleModel({ baseUrl: profile.baseUrl, apiKey, model: profile.model });
    this.modelLabel = profile.name;
    this.opts.session.append('model/switch', { id: profile.id, name: profile.name, model: profile.model });
    this.emit('  model switched to ' + profile.name + '  ·  ' + profile.model);
    this.redraw();
  }
  private async showPalette(): Promise<CommandDef | null> {
    if (!this.input.interactive) return null;
    let filter = '';
    let selected = 0;
    let result: CommandDef | null = null;
    while (true) {
      const matches = COMMANDS.filter((command) => {
        if (!filter) return true;
        return (command.name + ' ' + command.usage + ' ' + command.description).toLowerCase().includes(filter.toLowerCase());
      });
      selected = Math.max(0, Math.min(selected, Math.max(0, matches.length - 1)));
      this.input.clearScreen();
      this.input.write(renderCommandPalette(COMMANDS, filter, selected, true, this.menuWidth) + '\n');
      const key = await this.input.readKey();
      if (key.name === 'escape') break;
      if (key.name === 'return' || key.name === 'enter') {
        result = matches[selected] ?? null;
        break;
      }
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
    this.redraw();
    return result;
  }
}
