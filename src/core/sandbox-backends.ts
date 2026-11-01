import { spawn } from 'node:child_process';
import type { ShellResult, ShellRunner, SandboxInfo, WorkspaceGuard } from './sandbox.ts';
import { ShellSandbox } from './sandbox.ts';

export type SandboxBackendKind = 'workspace-guard' | 'wsl' | 'windows-restricted-token' | 'docker' | 'none';

export interface SandboxProbeResult {
  kind: SandboxBackendKind;
  available: boolean;
  reason: string;
  details?: string;
}

export class SandboxUnavailableError extends Error {
  readonly kind: SandboxBackendKind;
  readonly reason: string;

  constructor(kind: SandboxBackendKind, reason: string) {
    super('sandbox ' + kind + ' unavailable: ' + reason);
    this.name = 'SandboxUnavailableError';
    this.kind = kind;
    this.reason = reason;
  }
}

export interface WslOptions {
  wslPath?: string;
  distro?: string;
  user?: string;
  workspaceMount?: string;
}

export function decodeWslList(buffer: Buffer): string[] {
  const utf16 = buffer.length >= 2 && buffer[1] === 0;
  const text = buffer.toString(utf16 ? 'utf16le' : 'utf8');
  return text.replace(/\0/g, '\n').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function buildWslArgs(opts: { distro: string; user: string; workspaceMount: string; command: string }): string[] {
  return ['-d', opts.distro, '-u', opts.user, '--cd', opts.workspaceMount, '--', 'bash', '-lc', opts.command];
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<ShellResult> {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch (error) {
      resolvePromise({ code: null, stdout: '', stderr: String(error), timedOut: false });
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout?.on('data', (buf: Buffer) => stdout.push(buf));
    child.stderr?.on('data', (buf: Buffer) => stderr.push(buf));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ code: null, stdout: Buffer.concat(stdout).toString('utf8'), stderr: String(error), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut
      });
    });
  });
}

export class WslSandboxBackend implements ShellRunner {
  readonly kind: SandboxBackendKind = 'wsl';
  readonly info: SandboxInfo;
  readonly opts: Required<WslOptions>;
  private probed?: SandboxProbeResult;

  constructor(opts: WslOptions = {}) {
    this.opts = {
      wslPath: opts.wslPath ?? 'wsl.exe',
      distro: opts.distro ?? 'weft-sandbox',
      user: opts.user ?? 'weft',
      workspaceMount: opts.workspaceMount ?? '/workspace'
    };
    this.info = {
      backend: 'wsl',
      mode: 'wsl2',
      osBoundary: true,
      limitations: [
        'WSL2 VM boundary, not a per-command container.',
        'Workspace must be mounted at the configured path; /mnt access must be restricted inside the distro.',
        'Network isolation requires in-WSL bwrap/unshare; WSL itself does not disable network per command.',
        'Not suitable for Windows GUI/CUA.'
      ]
    };
  }

  async probe(): Promise<SandboxProbeResult> {
    const result = await runProcess(this.opts.wslPath, ['-l', '-q'], 5000);
    if (result.code !== 0) {
      this.probed = {
        kind: 'wsl',
        available: false,
        reason: 'wsl -l -q failed with code ' + result.code,
        details: (result.stderr || result.stdout).trim()
      };
      return this.probed;
    }
    const distros = decodeWslList(Buffer.from(result.stdout, 'utf8'));
    this.probed = distros.includes(this.opts.distro)
      ? { kind: 'wsl', available: true, reason: 'distro ' + this.opts.distro + ' found', details: distros.join(', ') }
      : { kind: 'wsl', available: false, reason: 'distro ' + this.opts.distro + ' not found', details: distros.join(', ') };
    return this.probed;
  }

  async run(command: string, timeoutMs = 30000): Promise<ShellResult> {
    const probe = this.probed ?? await this.probe();
    if (!probe.available) throw new SandboxUnavailableError('wsl', probe.reason);
    return runProcess(this.opts.wslPath, buildWslArgs({
      distro: this.opts.distro,
      user: this.opts.user,
      workspaceMount: this.opts.workspaceMount,
      command
    }), timeoutMs);
  }
}

export interface DockerOptions {
  dockerPath?: string;
  image?: string;
  workspace: string;
  user?: string;
  memory?: string;
  cpus?: string;
  pidsLimit?: number;
}

export function buildDockerArgs(opts: Required<DockerOptions> & { command: string }): string[] {
  return [
    'run',
    '--rm',
    '-i',
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', String(opts.pidsLimit),
    '--memory', opts.memory,
    '--cpus', opts.cpus,
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    '--user', opts.user,
    '--mount', 'type=bind,source=' + opts.workspace + ',target=/workspace',
    '-w', '/workspace',
    opts.image,
    'sh', '-lc', opts.command
  ];
}

export class DockerSandboxBackend implements ShellRunner {
  readonly kind: SandboxBackendKind = 'docker';
  readonly info: SandboxInfo;
  readonly opts: Required<DockerOptions>;
  private probed?: SandboxProbeResult;

  constructor(opts: DockerOptions) {
    this.opts = {
      dockerPath: opts.dockerPath ?? (process.platform === 'win32' ? 'docker.exe' : 'docker'),
      image: opts.image ?? process.env.WEFT_DOCKER_IMAGE ?? 'node:24-bookworm-slim',
      workspace: opts.workspace,
      user: opts.user ?? '1000:1000',
      memory: opts.memory ?? '512m',
      cpus: opts.cpus ?? '1',
      pidsLimit: opts.pidsLimit ?? 256
    };
    this.info = {
      backend: 'docker',
      mode: 'linux-container',
      osBoundary: true,
      limitations: [
        'Linux container via Docker Desktop; Windows GUI/CUA not available.',
        'Requires Docker daemon and image; unavailable => fail closed.',
        'Workspace is bind-mounted read-write; use a dedicated image and non-root user.',
        'Network is disabled with --network none; package installs need a prebuilt image.'
      ]
    };
  }

  async probe(): Promise<SandboxProbeResult> {
    const version = await runProcess(this.opts.dockerPath, ['version', '--format', '{{.Server.Version}}'], 8000);
    if (version.code !== 0) {
      this.probed = {
        kind: 'docker',
        available: false,
        reason: 'docker daemon unavailable',
        details: (version.stderr || version.stdout).trim()
      };
      return this.probed;
    }
    const image = await runProcess(this.opts.dockerPath, ['image', 'inspect', this.opts.image], 8000);
    if (image.code !== 0) {
      this.probed = {
        kind: 'docker',
        available: false,
        reason: 'docker image not present: ' + this.opts.image,
        details: (image.stderr || image.stdout).trim()
      };
      return this.probed;
    }
    this.probed = {
      kind: 'docker',
      available: true,
      reason: 'docker ' + version.stdout.trim() + ' image ' + this.opts.image
    };
    return this.probed;
  }

  async run(command: string, timeoutMs = 30000): Promise<ShellResult> {
    const probe = this.probed ?? await this.probe();
    if (!probe.available) throw new SandboxUnavailableError('docker', probe.reason);
    return runProcess(this.opts.dockerPath, buildDockerArgs({ ...this.opts, command }), timeoutMs);
  }
}

export interface ShellRunnerOptions {
  dockerImage?: string;
  dockerPath?: string;
  wsl?: WslOptions;
}

export async function createShellRunner(kind: SandboxBackendKind, guard: WorkspaceGuard, mode: string, options: ShellRunnerOptions = {}): Promise<ShellRunner> {
  if (kind === 'workspace-guard') return new ShellSandbox(guard, mode);
  if (kind === 'wsl') {
    const backend = new WslSandboxBackend(options.wsl);
    const probe = await backend.probe();
    if (!probe.available) throw new SandboxUnavailableError('wsl', probe.reason + (probe.details ? ': ' + probe.details : ''));
    return backend;
  }
  if (kind === 'docker') {
    const backend = new DockerSandboxBackend({ workspace: guard.workspace, image: options.dockerImage, dockerPath: options.dockerPath });
    const probe = await backend.probe();
    if (!probe.available) throw new SandboxUnavailableError('docker', probe.reason + (probe.details ? ': ' + probe.details : ''));
    return backend;
  }
  throw new SandboxUnavailableError(kind, 'backend not implemented in M1; fail closed');
}
