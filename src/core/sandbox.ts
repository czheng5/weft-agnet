import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';

export interface SandboxInfo {
  backend: string;
  mode: string;
  osBoundary: boolean;
  limitations: string[];
}

export class WorkspaceGuard {
  readonly workspace: string;

  constructor(workspace: string) {
    this.workspace = resolve(workspace);
    mkdirSync(this.workspace, { recursive: true });
  }

  resolveInside(input: string): string {
    const abs = isAbsolute(input) ? resolve(input) : resolve(this.workspace, input);
    const rel = relative(this.workspace, abs);
    if (rel === '') return abs;
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('path escapes workspace: ' + input);
    }
    return abs;
  }

  readFile(input: string): string {
    return readFileSync(this.resolveInside(input), 'utf8');
  }

  writeFile(input: string, content: string): string {
    const abs = this.resolveInside(input);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    return abs;
  }

  listDir(input: string): string[] {
    const abs = this.resolveInside(input || '.');
    if (!existsSync(abs)) return [];
    return readdirSync(abs).map((name) => {
      const full = join(abs, name);
      const st = statSync(full);
      return name + (st.isDirectory() ? '/' : '');
    });
  }
}

export interface ShellResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export class ShellSandbox {
  readonly guard: WorkspaceGuard;
  readonly info: SandboxInfo;

  constructor(guard: WorkspaceGuard, mode: string) {
    this.guard = guard;
    this.info = {
      backend: 'workspace-guard',
      mode,
      osBoundary: false,
      limitations: [
        'M0 user-space guard: file tools enforce workspace boundary; shell commands are policy-gated but not OS-isolated.',
        'OS-level Windows sandbox backend is M1.'
      ]
    };
  }

  run(command: string, timeoutMs = 30000): Promise<ShellResult> {
    return new Promise((resolvePromise) => {
      const child = spawn(command, {
        cwd: this.guard.workspace,
        shell: true,
        windowsHide: true,
        env: { ...process.env, WEFT_SANDBOX: 'workspace-guard' }
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout?.on('data', (buf) => { stdout += String(buf); });
      child.stderr?.on('data', (buf) => { stderr += String(buf); });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolvePromise({ code: null, stdout, stderr: stderr + String(err), timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolvePromise({ code, stdout, stderr, timedOut });
      });
    });
  }
}
