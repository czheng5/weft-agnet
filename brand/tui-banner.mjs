#!/usr/bin/env node
/**
 * Weft TUI banner — zero-dependency ANSI renderer.
 *
 * Usage:
 *   node brand/tui-banner.mjs
 *   node brand/tui-banner.mjs --plain
 *   NO_COLOR=1 node brand/tui-banner.mjs
 */
import { pathToFileURL } from 'node:url';

export const PALETTE = {
  cyan: '#22D3EE',
  cyanBright: '#67E8F9',
  cyanDim: '#0E7490',
  text: '#E6EDF3',
  muted: '#8B98A9',
  border: '#1E293B',
  success: '#5EEAD4',
  warning: '#FBBF24',
  error: '#FB7185',
};

const LOGO = [
  '  ██╗    ██╗███████╗███████╗████████╗',
  '  ██║    ██║██╔════╝██╔════╝╚══██╔══╝',
  '  ██║ █╗ ██║█████╗  █████╗     ██║   ',
  '  ██║███╗██║██╔══╝  ██╔══╝     ██║   ',
  '  ╚███╔███╔╝███████╗██║        ██║   ',
  '   ╚══╝╚══╝ ╚══════╝╚═╝        ╚═╝   ',
];

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

function displayWidth(value) {
  let width = 0;
  for (const char of String(value)) {
    if (WIDE.test(char)) width += 2;
    else if (/[\u0300-\u036F]/.test(char)) width += 0;
    else width += 1;
  }
  return width;
}

function fit(value, target) {
  const text = String(value);
  const width = displayWidth(text);
  if (width === target) return text;
  if (width < target) return text + ' '.repeat(target - width);
  let out = '';
  let used = 0;
  for (const char of text) {
    const w = WIDE.test(char) ? 2 : 1;
    if (used + w > target) break;
    out += char;
    used += w;
  }
  return out + ' '.repeat(Math.max(0, target - used));
}

function rgb(hex) {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function paint(hex, text, color) {
  if (!color) return text;
  const [r, g, b] = rgb(hex);
  return '\u001b[38;2;' + r + ';' + g + ';' + b + 'm' + text + '\u001b[0m';
}

function divider(inner, left, right, color) {
  return '  ' + paint(PALETTE.border, left + '─'.repeat(inner) + right, color);
}

function row(content, inner, color) {
  return '  ' + paint(PALETTE.border, '│', color) + ' ' + fit(content, inner - 2) + ' ' + paint(PALETTE.border, '│', color);
}

export function renderBanner(options = {}) {
  const color = options.color !== false && !('NO_COLOR' in process.env);
  const o = {
    version: '2.5.0',
    cwd: process.cwd(),
    model: 'deepseek-flash',
    provider: 'deepseek',
    sandbox: 'workspace-write',
    approvals: 'ask',
    ...options,
  };
  const inner = 64;
  const lines = [''];

  for (const line of LOGO) lines.push('  ' + paint(PALETTE.cyan, line.trimEnd(), color));

  lines.push('');
  lines.push(
    '  ' + paint(PALETTE.cyan, '≡ WEFT', color) +
    '   ' + paint(PALETTE.cyanBright, '七襄', color) +
    '   ' + paint(PALETTE.muted, 'v' + o.version, color) +
    '   ' + paint(PALETTE.muted, '·', color) +
    '   ' + paint(PALETTE.text, '三线成纬，七襄成章', color)
  );
  lines.push('');
  lines.push(divider(inner, '╭', '╮', color));
  lines.push(row('  ' + paint(PALETTE.cyan, '≡  Welcome to Weft!', color), inner, color));
  lines.push(row('', inner, color));
  lines.push(row('  ' + paint(PALETTE.muted, '/help for help     /status for runtime     /plan to start', color), inner, color));
  lines.push(row('', inner, color));
  lines.push(row('  ' + paint(PALETTE.muted, 'cwd      ', color) + o.cwd, inner, color));
  lines.push(row('  ' + paint(PALETTE.muted, 'model    ', color) + o.model + paint(PALETTE.muted, '  ·  ' + o.provider, color), inner, color));
  lines.push(row('  ' + paint(PALETTE.muted, 'sandbox  ', color) + o.sandbox + paint(PALETTE.muted, '  ·  approvals ' + o.approvals, color), inner, color));
  lines.push(divider(inner, '╰', '╯', color));
  lines.push('');
  lines.push('  ' + paint(PALETTE.cyanBright, '※', color) + ' ' + paint(PALETTE.text, 'Tip', color) + '  ' + paint(PALETTE.muted, '计划先落盘，执行先沙箱；缓存靠前缀，记忆靠评估。', color));
  lines.push('');
  lines.push('  ' + paint(PALETTE.cyan, '>', color) + ' ' + paint(PALETTE.text, '把 01-codex / 02-claude / 03-dsh 综合成 M0 实现计划', color));
  lines.push('    ' + paint(PALETTE.cyan, '█', color));
  lines.push('');
  lines.push('  ' + paint(PALETTE.success, '⏺', color) + ' ' + paint(PALETTE.muted, 'weft v' + o.version + '    ' + o.sandbox + '    approvals ' + o.approvals + '    cache —    0 tok', color));
  lines.push('');

  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const plain = process.argv.includes('--plain');
  process.stdout.write(renderBanner({ color: !plain }) + '\n');
}
