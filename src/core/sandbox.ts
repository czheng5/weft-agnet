import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
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

export interface ShellRunner {
  readonly info: SandboxInfo;
  run(command: string, timeoutMs?: number): Promise<ShellResult>;
}

export class ShellSandbox implements ShellRunner {
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
    const tempDir = join(this.guard.workspace, '.weft', 'tmp');
    mkdirSync(tempDir, { recursive: true });
    const base = 'run-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const outFile = join(tempDir, base + '.out');
    const errFile = join(tempDir, base + '.err');
    const quote = (path: string): string => '"' + path.replace(/"/g, '\"') + '"';
    const full = command + ' > ' + quote(outFile) + ' 2> ' + quote(errFile);

    return new Promise((resolvePromise) => {
      let child;
      try {
        child = spawn(full, {
          cwd: this.guard.workspace,
          shell: true,
          stdio: 'ignore',
          windowsHide: true,
          env: { ...process.env, WEFT_SANDBOX: 'workspace-guard' }
        });
      } catch (error) {
        resolvePromise({ code: null, stdout: '', stderr: String(error), timedOut: false });
        return;
      }
      let timedOut = false;
      const cleanup = (): { stdout: string; stderr: string } => {
        const stdout = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
        const stderr = existsSync(errFile) ? readFileSync(errFile, 'utf8') : '';
        try { rmSync(outFile, { force: true }); } catch { /* ignore */ }
        try { rmSync(errFile, { force: true }); } catch { /* ignore */ }
        return { stdout, stderr };
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.on('error', (err) => {
        clearTimeout(timer);
        const captured = cleanup();
        resolvePromise({ code: null, stdout: captured.stdout, stderr: captured.stderr + String(err), timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const captured = cleanup();
        resolvePromise({ code, stdout: captured.stdout, stderr: captured.stderr, timedOut });
      });
    });
  }
}
