import { emitKeypressEvents } from 'node:readline';
import { createInterface, type Interface } from 'node:readline/promises';
import { visibleWidth } from './tui-menu.ts';

export interface KeyEvent {
  name?: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  sequence?: string;
}

export type LineAction = 'line' | 'help' | 'palette' | 'cancel' | 'interrupt' | 'eof';

export interface LineResult {
  action: LineAction;
  text?: string;
}

export interface ReadLineOptions {
  prompt: string;
  hint?: string;
  history?: string[];
  initialText?: string;
  complete?: (text: string, cursor: number) => { text: string; cursor: number } | null;
}

type TtyInput = NodeJS.ReadStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => void };
type TtyOutput = NodeJS.WriteStream;

export class TuiInput {
  readonly interactive: boolean;
  private readonly input: TtyInput;
  private readonly output: TtyOutput;
  private fallback: Interface | null = null;
  private active = false;
  private handler: ((sequence: string, key: KeyEvent) => void) | null = null;

  constructor(input: TtyInput = process.stdin, output: TtyOutput = process.stdout) {
    this.input = input;
    this.output = output;
    this.interactive = Boolean(input.isTTY && output.isTTY && input.setRawMode);
    emitKeypressEvents(input);
    if (!this.interactive) {
      this.fallback = createInterface({ input, output });
    }
  }

  get columns(): number {
    return this.output.columns ?? 80;
  }

  write(text: string): void {
    this.output.write(text);
  }

  clearScreen(): void {
    this.output.write('\x1b[2J\x1b[H');
  }

  enterAltScreen(): void {
    this.output.write('\x1b[?1049h\x1b[2J\x1b[H');
  }

  exitAltScreen(): void {
    this.output.write('\x1b[?1049l');
  }

  async readLine(options: ReadLineOptions): Promise<LineResult> {
    if (!this.interactive) {
      if (!this.fallback) return { action: 'eof' };
      try {
        const text = await this.fallback.question(options.prompt);
        this.output.write('\n');
        return { action: 'line', text };
      } catch {
        return { action: 'eof' };
      }
    }

    const history = options.history ?? [];
    let text = options.initialText ?? '';
    let cursor = text.length;
    let historyIndex = history.length;
    let draft = '';

    return new Promise<LineResult>((resolve) => {
      const finish = (result: LineResult): void => {
        this.detach();
        this.output.write('\n');
        resolve(result);
      };

      const render = (): void => {
        this.renderLine(options.prompt, text, cursor, options.hint ?? '');
      };

      const handler = (sequence: string, key: KeyEvent): void => {
        const name = key.name;

        if (name === 'return' || name === 'enter') {
          finish({ action: 'line', text });
          return;
        }
        if (name === 'escape') {
          if (text.length > 0) {
            text = '';
            cursor = 0;
            render();
          } else {
            finish({ action: 'cancel' });
          }
          return;
        }
        if (key.ctrl && name === 'c') {
          if (text.length > 0) {
            text = '';
            cursor = 0;
            render();
          } else {
            finish({ action: 'interrupt' });
          }
          return;
        }
        if (key.ctrl && name === 'd') {
          if (text.length === 0) finish({ action: 'eof' });
          return;
        }
        if (key.ctrl && name === 'l') {
          this.clearScreen();
          this.output.write('  WEFT 七襄 · Ctrl+L\n\n');
          render();
          return;
        }
        if (key.ctrl && name === 'k') {
          finish({ action: 'palette' });
          return;
        }
        if (sequence === '?' && text.length === 0) {
          finish({ action: 'help' });
          return;
        }
        if (name === 'tab') {
          const completed = options.complete?.(text, cursor);
          if (completed) {
            text = completed.text;
            cursor = completed.cursor;
            render();
          }
          return;
        }
        if (name === 'up') {
          if (history.length === 0) return;
          if (historyIndex === history.length) draft = text;
          if (historyIndex > 0) historyIndex -= 1;
          text = history[historyIndex] ?? '';
          cursor = text.length;
          render();
          return;
        }
        if (name === 'down') {
          if (history.length === 0) return;
          if (historyIndex < history.length) historyIndex += 1;
          text = historyIndex === history.length ? draft : (history[historyIndex] ?? '');
          cursor = text.length;
          render();
          return;
        }
        if (name === 'left') {
          cursor = Math.max(0, cursor - 1);
          render();
          return;
        }
        if (name === 'right') {
          cursor = Math.min(text.length, cursor + 1);
          render();
          return;
        }
        if (name === 'home') {
          cursor = 0;
          render();
          return;
        }
        if (name === 'end') {
          cursor = text.length;
          render();
          return;
        }
        if (name === 'backspace') {
          if (cursor > 0) {
            text = text.slice(0, cursor - 1) + text.slice(cursor);
            cursor -= 1;
            render();
          }
          return;
        }
        if (name === 'delete') {
          if (cursor < text.length) {
            text = text.slice(0, cursor) + text.slice(cursor + 1);
            render();
          }
          return;
        }
        if (key.ctrl || key.meta) return;
        if (sequence && sequence.length > 0 && !/[\x00-\x1f\x7f]/.test(sequence)) {
          text = text.slice(0, cursor) + sequence + text.slice(cursor);
          cursor += sequence.length;
          render();
        }
      };

      this.attach(handler);
      render();
    });
  }

  async readKey(prompt = '', hint = ''): Promise<KeyEvent> {
    if (!this.interactive) return { name: 'escape' };
    return new Promise<KeyEvent>((resolve) => {
      const finish = (key: KeyEvent): void => {
        this.detach();
        if (prompt) this.output.write('\n');
        resolve(key);
      };
      if (prompt) this.renderLine(prompt, '', 0, hint);
      this.attach((_sequence, key) => finish(key));
    });
  }

  async readChoice(prompt: string, choices: string[], hint = ''): Promise<string | null> {
    if (!this.interactive) {
      const result = await this.readLine({ prompt, hint });
      if (result.action !== 'line' || !result.text) return null;
      const value = result.text.trim().toLowerCase();
      return choices.includes(value) ? value : null;
    }
    return new Promise<string | null>((resolve) => {
      const finish = (value: string | null): void => {
        this.detach();
        this.output.write('\n');
        resolve(value);
      };
      this.renderLine(prompt, '', 0, hint);
      this.attach((sequence, key) => {
        if (key.name === 'escape') { finish(null); return; }
        const value = (sequence || key.name || '').toLowerCase();
        if (value.length === 1 && choices.includes(value)) finish(value);
      });
    });
  }

  close(): void {
    this.detach();
    this.fallback?.close();
    this.fallback = null;
  }

  private attach(handler: (sequence: string, key: KeyEvent) => void): void {
    if (this.active) throw new Error('TuiInput is already active');
    this.active = true;
    this.handler = handler;
    this.input.setRawMode?.(true);
    this.input.resume();
    this.input.on('keypress', handler);
  }

  private detach(): void {
    if (!this.active) return;
    if (this.handler) this.input.off('keypress', this.handler);
    this.handler = null;
    this.active = false;
    this.input.setRawMode?.(false);
    this.input.pause();
  }

  private renderLine(prompt: string, text: string, cursor: number, hint: string): void {
    const used = visibleWidth(prompt + text);
    const available = Math.max(0, this.columns - used - 2);
    const shown = available > 4 ? this.clipHint(hint, available) : '';
    const hintText = shown ? '  \x1b[2m' + shown + '\x1b[0m' : '';
    this.output.write('\r\x1b[2K' + prompt + text + hintText);
    this.output.write('\r');
    const offset = visibleWidth(prompt + text.slice(0, cursor));
    if (offset > 0) this.output.write('\x1b[' + offset + 'C');
  }

  private clipHint(hint: string, width: number): string {
    if (visibleWidth(hint) <= width) return hint;
    let out = '';
    let used = 0;
    for (const char of hint) {
      const w = visibleWidth(char);
      if (used + w > width - 1) break;
      out += char;
      used += w;
    }
    return out + '…';
  }
}
