import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../src/core/keymap.ts';
import { fitVisible, renderChoiceMenu, renderCommandPalette, renderKeyHelp, renderSettingsPanel, visibleWidth } from '../src/core/tui-menu.ts';

function plain(value: string): string {
  return value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

test('TUI panels are stable across repeated render and widths', () => {
  for (const width of [40, 60, 72, 100, 120]) {
    const first = plain(renderKeyHelp(undefined, false, width));
    for (let i = 0; i < 5; i += 1) {
      assert.equal(plain(renderKeyHelp(undefined, false, width)), first);
    }
    assert.doesNotMatch(first, /undefined|NaN|\[object Object\]/);
    const palette = plain(renderCommandPalette(COMMANDS, '', 0, false, width));
    assert.doesNotMatch(palette, /undefined|NaN|\[object Object\]/);
    const settings = plain(renderSettingsPanel({ version: '2.5.0', cwd: 'D:\\a\\very\\long\\workspace\\path', model: 'scripted', sandbox: 'workspace-guard', approvals: 'on-request' }, false, width));
    assert.doesNotMatch(settings, /undefined|NaN|\[object Object\]/);
  }
});

test('TUI ANSI width and truncation stay bounded', () => {
  for (const value of ['hello', '七襄 TUI', '\x1b[36mWEFT\x1b[0m 七襄', 'a'.repeat(200)]) {
    assert.ok(visibleWidth(value) >= 0);
    const fitted = fitVisible(value, 20);
    assert.ok(visibleWidth(fitted) <= 20);
  }
  const menu = renderChoiceMenu('T', [{ label: 'one', description: 'first' }, { label: 'two' }], 1, false, 40);
  assert.match(plain(menu), /two/);
  assert.doesNotMatch(plain(menu), /undefined/);
});
