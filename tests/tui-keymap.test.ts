import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, KEYMAP, bindingsFor, completeCommand, formatKey, hintsFor } from '../src/core/keymap.ts';
import { renderCommandPalette, renderKeyHelp, renderStatusBar } from '../src/core/tui-menu.ts';

test('keymap ids and per-context keys are unique', () => {
  const ids = new Set<string>();
  for (const binding of KEYMAP) {
    assert.equal(ids.has(binding.id), false, 'duplicate binding id: ' + binding.id);
    ids.add(binding.id);
  }
  for (const context of ['prompt', 'approval', 'overlay', 'generating', 'global'] as const) {
    const keys = new Set<string>();
    for (const binding of bindingsFor(context)) {
      for (const key of binding.keys) {
        assert.equal(keys.has(key), false, 'duplicate key ' + key + ' in ' + context);
        keys.add(key);
      }
    }
  }
});

test('keymap exposes compact hints and command completion', () => {
  assert.match(hintsFor('prompt'), /\? keys/);
  assert.match(hintsFor('prompt'), /Ctrl\+K palette/);
  assert.equal(formatKey('ctrl+k'), 'Ctrl+K');
  assert.equal(completeCommand('/he', 3)?.text, '/help');
  assert.equal(completeCommand('/mem', 4)?.text, '/memory ');
  assert.equal(completeCommand('hello', 5), null);
});

test('command deck renders shortcuts and filters commands', () => {
  const help = renderKeyHelp(undefined, false);
  assert.match(help, /WEFT 七襄/);
  assert.match(help, /\[Ctrl\+K\]/);
  const palette = renderCommandPalette(COMMANDS, 'mem', 0, false);
  assert.match(palette, /\/memory/);
  assert.doesNotMatch(palette, /\/goal/);
});

test('status bar carries runtime identity', () => {
  const line = renderStatusBar({ version: '2.5.0', sandbox: 'workspace-guard', approvals: 'on-request', model: 'deepseek-flash' }, false);
  assert.match(line, /WEFT 七襄/);
  assert.match(line, /workspace-guard/);
  assert.match(line, /2\.5\.0/);
});
