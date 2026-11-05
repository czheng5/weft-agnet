export type KeyContext = 'prompt' | 'approval' | 'overlay' | 'generating' | 'global';

export interface KeyBinding {
  id: string;
  keys: string[];
  label: string;
  description: string;
  section: 'Navigate' | 'Compose' | 'Approval' | 'Overlay';
  contexts: KeyContext[];
  hint?: string;
}

export interface CommandDef {
  name: string;
  usage: string;
  description: string;
  group: 'Session' | 'Plan' | 'Knowledge' | 'System';
  takesArg?: boolean;
  keys?: string[];
}

export const KEYMAP: KeyBinding[] = [
  { id: 'help', keys: ['?'], label: '?', description: '快捷键与命令帮助', section: 'Navigate', contexts: ['prompt'], hint: '? keys' },
  { id: 'palette', keys: ['ctrl+k'], label: 'Ctrl+K', description: '打开命令面板', section: 'Navigate', contexts: ['prompt'], hint: 'Ctrl+K palette' },
  { id: 'commands', keys: ['/'], label: '/', description: '斜杠命令', section: 'Navigate', contexts: ['prompt'], hint: '/ commands' },
  { id: 'clear-screen', keys: ['ctrl+l'], label: 'Ctrl+L', description: '清屏并保留当前会话', section: 'Navigate', contexts: ['prompt'], hint: 'Ctrl+L clear' },
  { id: 'cancel', keys: ['esc'], label: 'Esc', description: '清空当前输入 / 取消审批', section: 'Compose', contexts: ['prompt', 'approval'], hint: 'Esc cancel' },
  { id: 'interrupt', keys: ['ctrl+c'], label: 'Ctrl+C', description: '清空输入；空输入连按两次退出', section: 'Compose', contexts: ['prompt'], hint: 'Ctrl+C cancel' },
  { id: 'history-prev', keys: ['up'], label: '↑', description: '上一条历史', section: 'Compose', contexts: ['prompt'], hint: '↑↓ history' },
  { id: 'history-next', keys: ['down'], label: '↓', description: '下一条历史', section: 'Compose', contexts: ['prompt'], hint: '↑↓ history' },
  { id: 'complete', keys: ['tab'], label: 'Tab', description: '补全斜杠命令', section: 'Compose', contexts: ['prompt'], hint: 'Tab complete' },
  { id: 'eof', keys: ['ctrl+d'], label: 'Ctrl+D', description: '退出 Weft', section: 'Compose', contexts: ['prompt'], hint: 'Ctrl+D quit' },
  { id: 'approve-once', keys: ['y'], label: 'Y', description: '本次允许', section: 'Approval', contexts: ['approval'] },
  { id: 'approve-session', keys: ['s'], label: 'S', description: '本会话允许', section: 'Approval', contexts: ['approval'] },
  { id: 'deny', keys: ['n'], label: 'N', description: '拒绝', section: 'Approval', contexts: ['approval'] },
  { id: 'overlay-prev', keys: ['up', 'k'], label: '↑', description: '上一项', section: 'Overlay', contexts: ['overlay'] },
  { id: 'overlay-next', keys: ['down', 'j'], label: '↓', description: '下一项', section: 'Overlay', contexts: ['overlay'] },
  { id: 'overlay-select', keys: ['enter'], label: 'Enter', description: '选择 / 执行', section: 'Overlay', contexts: ['overlay'] },
  { id: 'overlay-close', keys: ['esc'], label: 'Esc', description: '关闭菜单', section: 'Overlay', contexts: ['overlay'] }
];

export const COMMANDS: CommandDef[] = [
  { name: 'help', usage: '/help', description: '命令与快捷键总览', group: 'System' },
  { name: 'keys', usage: '/keys', description: '打开快捷键面板', group: 'System' },
  { name: 'menu', usage: '/menu', description: '打开命令面板', group: 'System' },
  { name: 'clear', usage: '/clear', description: '清屏', group: 'System' },
  { name: 'status', usage: '/status', description: '查看运行时状态', group: 'Session' },
  { name: 'plan', usage: '/plan', description: '查看 Work Graph / 计划', group: 'Plan' },
  { name: 'goal', usage: '/goal ', description: '创建目标', group: 'Plan', takesArg: true },
  { name: 'task', usage: '/task ', description: '添加任务', group: 'Plan', takesArg: true },
  { name: 'tasks', usage: '/tasks', description: '列出任务', group: 'Plan' },
  { name: 'start', usage: '/start ', description: '开始任务', group: 'Plan', takesArg: true },
  { name: 'done', usage: '/done ', description: '完成任务', group: 'Plan', takesArg: true },
  { name: 'metrics', usage: '/metrics', description: '查看运行指标', group: 'System' },
  { name: 'events', usage: '/events', description: '查看最近事件', group: 'Session' },
  { name: 'memory', usage: '/memory ', description: '搜索记忆', group: 'Knowledge', takesArg: true },
  { name: 'kb', usage: '/kb ', description: '搜索知识库', group: 'Knowledge', takesArg: true },
  { name: 'demo', usage: '/demo', description: '运行 M0 演示', group: 'System' },
  { name: 'quit', usage: '/quit', description: '退出 Weft', group: 'Session' }
];

const KEY_LABELS: Record<string, string> = {
  esc: 'Esc',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  home: 'Home',
  end: 'End'
};

export function formatKey(key: string): string {
  const lower = key.toLowerCase();
  if (KEY_LABELS[lower]) return KEY_LABELS[lower];
  return lower
    .split('+')
    .map((part) => part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join('+');
}

export function bindingsFor(context: KeyContext): KeyBinding[] {
  return KEYMAP.filter((binding) => binding.contexts.includes(context));
}

export function hintsFor(context: KeyContext): string {
  return bindingsFor(context)
    .map((binding) => binding.hint ?? binding.label)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join('  ·  ');
}

export function commandsMatching(prefix: string): CommandDef[] {
  const clean = prefix.trim().toLowerCase();
  if (!clean.startsWith('/')) return [];
  const name = clean.slice(1).split(/\s+/)[0] ?? '';
  if (!name) return COMMANDS;
  return COMMANDS.filter((command) => command.name.startsWith(name));
}

export function completeCommand(text: string, cursor: number): { text: string; cursor: number } | null {
  const head = text.slice(0, cursor);
  if (!head.startsWith('/')) return null;
  const matches = commandsMatching(head);
  if (matches.length === 0) return null;
  if (matches.length === 1) {
    const next = matches[0].usage;
    return { text: next + text.slice(cursor), cursor: next.length };
  }
  const names = matches.map((command) => command.name);
  const common = names.reduce((prefix, name) => {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i += 1;
    return prefix.slice(0, i);
  });
  if (common.length <= (head.slice(1).split(/\s+/)[0] ?? '').length) return null;
  const next = '/' + common;
  return { text: next + text.slice(cursor), cursor: next.length };
}
