import { COMMANDS, KEYMAP, type CommandDef, type KeyBinding } from './keymap.ts';

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI, '');
}

export function visibleWidth(value: string): number {
  let width = 0;
  for (const char of stripAnsi(value)) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6)) {
      width += 2;
    } else if (code >= 0x0300 && code <= 0x036f) {
      width += 0;
    } else {
      width += 1;
    }
  }
  return width;
}

export function fitVisible(value: string, width: number): string {
  const raw = stripAnsi(value);
  if (visibleWidth(raw) === width) return value;
  if (visibleWidth(raw) < width) return value + ' '.repeat(width - visibleWidth(raw));
  let out = '';
  let used = 0;
  for (const char of raw) {
    const w = visibleWidth(char);
    if (used + w > width) break;
    out += char;
    used += w;
  }
  return out + ' '.repeat(Math.max(0, width - used));
}

function paint(code: string, text: string, color: boolean): string {
  return color ? '\x1b[' + code + 'm' + text + '\x1b[0m' : text;
}

export function keycap(label: string, color = true): string {
  return color ? '\x1b[7m ' + label + ' \x1b[0m' : '[' + label + ']';
}

function boxLine(content: string, width: number, color: boolean, left = '│', right = '│'): string {
  return paint('36', left, color) + ' ' + fitVisible(content, width - 4) + ' ' + paint('36', right, color);
}

function boxTop(title: string, width: number, color: boolean): string {
  const head = ' ' + title + ' ';
  return paint('36', '╭─' + head + '─'.repeat(Math.max(0, width - 4 - visibleWidth(head))) + '╮', color);
}

function boxBottom(width: number, color: boolean): string {
  return paint('36', '╰' + '─'.repeat(width - 2) + '╯', color);
}

export function renderKeyHelp(bindings: KeyBinding[] = KEYMAP, color = true, width = 72): string {
  const sections: KeyBinding['section'][] = ['Navigate', 'Compose', 'Approval', 'Overlay'];
  const rows: string[] = [];
  for (const section of sections) {
    const items = bindings.filter((binding) => binding.section === section);
    if (items.length === 0) continue;
    rows.push(paint('1;36', section.toUpperCase(), color));
    for (const item of items) {
      rows.push('  ' + fitVisible(keycap(item.label, color), 14) + '  ' + item.description);
    }
    rows.push('');
  }
  rows.push(paint('2', 'Esc 关闭   ? 帮助   Ctrl+K 命令面板   / 斜杠命令', color));
  width = Math.max(40, width);
  const lines = [boxTop('WEFT 七襄 · KEYS / 快捷键', width, color)];
  for (const row of rows) lines.push(boxLine(row, width, color));
  lines.push(boxBottom(width, color));
  return lines.join('\n');
}

export function renderCommandPalette(commands: CommandDef[], filter: string, selected: number, color = true, width = 72): string {
  const needle = filter.trim().toLowerCase();
  const matches = commands.filter((command) => {
    if (!needle) return true;
    return (command.name + ' ' + command.usage + ' ' + command.description).toLowerCase().includes(needle);
  });
  const index = Math.max(0, Math.min(selected, Math.max(0, matches.length - 1)));
  const start = Math.max(0, Math.min(index - 4, matches.length - 10));
  const rows: string[] = [];
  let lastGroup = '';
  matches.slice(start, start + 10).forEach((command, i) => {
    const absolute = start + i;
    if (command.group !== lastGroup) {
      rows.push(paint('1;36', command.group.toUpperCase(), color));
      lastGroup = command.group;
    }
    const marker = absolute === index ? paint('1;36', '▶', color) : ' ';
    const usage = fitVisible(command.usage, 16);
    rows.push(' ' + marker + ' ' + paint(absolute === index ? '1;37' : '0', usage, color) + '  ' + command.description);
  });
  if (matches.length === 0) rows.push(paint('2', 'no match', color));
  rows.push('');
  rows.push(paint('2', 'type filter · ↑↓ move · Enter run · Esc close', color));
  width = Math.max(40, width);
  const title = 'WEFT 七襄 · COMMAND DECK  ' + (filter ? '/' + filter : '');
  const lines = [boxTop(title, width, color)];
  for (const row of rows) lines.push(boxLine(row, width, color));
  lines.push(boxBottom(width, color));
  return lines.join('\n');
}

export function renderCommandList(commands: CommandDef[] = COMMANDS, color = true, width = 72): string {
  const rows = commands.map((command) => '  ' + fitVisible(command.usage, 18) + '  ' + command.description);
  width = Math.max(40, width);
  return [boxTop('WEFT 七襄 · COMMANDS', width, color), ...rows.map((row) => boxLine(row, width, color)), boxBottom(width, color)].join('\n');
}

export function renderStatusBar(meta: { version: string; sandbox: string; approvals: string; model: string }, color = true): string {
  const chips = [
    'WEFT 七襄',
    'v' + meta.version,
    meta.sandbox,
    'approvals ' + meta.approvals,
    meta.model
  ];
  return '  ' + chips.map((chip, i) => i === 0 ? paint('1;36', chip, color) : paint('2', chip, color)).join(paint('2', '  ·  ', color));
}

export interface ChoiceItem {
  label: string;
  description?: string;
  disabled?: boolean;
}

export function renderChoiceMenu(title: string, items: ChoiceItem[], selected: number, color = true, width = 72): string {
  const index = Math.max(0, Math.min(selected, Math.max(0, items.length - 1)));
  const rows: string[] = [];
  if (items.length === 0) {
    rows.push(paint('2', 'no items', color));
  } else {
    items.slice(0, 14).forEach((item, i) => {
      const marker = i === index ? paint('1;36', '▶', color) : ' ';
      const label = fitVisible(item.label, 22);
      const desc = item.description ? '  ' + item.description : '';
      rows.push(' ' + marker + ' ' + paint(item.disabled ? '2' : (i === index ? '1;37' : '0'), label + desc, color));
    });
  }
  rows.push('');
  rows.push(paint('2', '↑↓ move · Enter select · Esc close', color));
  width = Math.max(40, width);
  const lines = [boxTop(title, width, color)];
  for (const row of rows) lines.push(boxLine(row, width, color));
  lines.push(boxBottom(width, color));
  return lines.join('\n');
}

export function renderSettingsPanel(settings: { version: string; cwd: string; model: string; sandbox: string; approvals: string }, color = true, width = 72): string {
  width = Math.max(40, width);
  const rows: string[] = [];
  const add = (label: string, value: string): void => {
    const lines = wrapVisible(value, Math.max(12, width - 16));
    rows.push('  ' + paint('2', fitVisible(label, 10), color) + '  ' + lines[0]);
    for (const line of lines.slice(1)) rows.push('  ' + ' '.repeat(12) + line);
  };
  add('product', 'WEFT 七襄');
  add('version', settings.version);
  add('cwd', settings.cwd);
  add('model', settings.model);
  add('sandbox', settings.sandbox);
  add('approvals', settings.approvals);
  rows.push('');
  rows.push(paint('2', 'F2 model · Esc close', color));
  const lines = [boxTop('WEFT 七襄 · SETTINGS', width, color)];
  for (const row of rows) lines.push(boxLine(row, width, color));
  lines.push(boxBottom(width, color));
  return lines.join('\n');
}

function wrapVisible(value: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  let used = 0;
  for (const char of value) {
    const w = visibleWidth(char);
    if (used + w > width && current) {
      lines.push(current);
      current = '';
      used = 0;
    }
    current += char;
    used += w;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}
