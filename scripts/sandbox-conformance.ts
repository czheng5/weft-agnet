import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WorkspaceGuard } from '../src/core/sandbox.ts';
import { createShellRunner } from '../src/core/sandbox-backends.ts';
import type { SandboxBackendKind } from '../src/core/sandbox-backends.ts';

interface Args {
  backend: SandboxBackendKind;
  workspace: string;
  dockerImage?: string;
  timeoutMs: number;
  wslDistro?: string;
  wslUser?: string;
  wslMount?: string;
}

function parseArgs(argv: string[]): Args {
  let backend: SandboxBackendKind = 'workspace-guard';
  let workspace = process.cwd();
  let dockerImage: string | undefined;
  let timeoutMs = 20000;
  let wslDistro: string | undefined;
  let wslUser: string | undefined;
  let wslMount: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--backend' && argv[i + 1]) backend = argv[++i] as SandboxBackendKind;
    else if (arg === '--workspace' && argv[i + 1]) workspace = resolve(argv[++i]);
    else if (arg === '--docker-image' && argv[i + 1]) dockerImage = argv[++i];
    else if (arg === '--timeout' && argv[i + 1]) timeoutMs = Number(argv[++i]);
    else if (arg === '--wsl-distro' && argv[i + 1]) wslDistro = argv[++i];
    else if (arg === '--wsl-user' && argv[i + 1]) wslUser = argv[++i];
    else if (arg === '--wsl-mount' && argv[i + 1]) wslMount = argv[++i];
  }
  return { backend, workspace, dockerImage, timeoutMs, wslDistro, wslUser, wslMount };
}

interface Result {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workspace = resolve(args.workspace);
  const guard = new WorkspaceGuard(workspace);
  const runner = await createShellRunner(args.backend, guard, 'workspace-write', {
    dockerImage: args.dockerImage,
    wsl: { distro: args.wslDistro, user: args.wslUser, workspaceMount: args.wslMount }
  });
  const results: Result[] = [];

  async function check(name: string, fn: () => Promise<string>, skip = false): Promise<void> {
    if (skip) {
      results.push({ name, status: 'SKIP', detail: 'not applicable to this backend' });
      return;
    }
    try {
      const detail = await fn();
      results.push({ name, status: 'PASS', detail });
    } catch (error) {
      results.push({ name, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) });
    }
  }

  await check('path escape is rejected', async () => {
    try {
      guard.resolveInside('../weft-escape.txt');
    } catch {
      return 'guard rejected ../weft-escape.txt';
    }
    throw new Error('guard allowed ../weft-escape.txt');
  });

  await check('workspace is reachable', async () => {
    const expected = args.backend === 'workspace-guard' || args.backend === 'bwrap'
      ? workspace.replace(/\\/g, '/')
      : args.backend === 'wsl' && args.wslMount ? args.wslMount : '/workspace';
    const result = await runner.run(args.backend === 'wsl' ? 'pwd' : 'node -e "console.log(process.cwd())"', args.timeoutMs);
    if (result.code !== 0) throw new Error('pwd failed: ' + result.stderr);
    if (!result.stdout.replace(/\\/g, '/').includes(expected.replace(/\\/g, '/'))) {
      throw new Error('pwd mismatch: ' + result.stdout.trim() + ' expected ' + expected);
    }
    return result.stdout.trim();
  });

  await check('workspace write works', async () => {
    const marker = '.weft-conformance.txt';
    const target = join(workspace, marker);
    if (existsSync(target)) rmSync(target, { force: true });
    const code = args.backend === 'wsl'
      ? 'printf weft-ok > ' + marker + ' && cat ' + marker
      : 'node -e "require(\'fs\').writeFileSync(\'' + marker + '\',\'weft-ok\');process.stdout.write(require(\'fs\').readFileSync(\'' + marker + '\',\'utf8\'))"';
    const result = await runner.run(code, args.timeoutMs);
    if (result.code !== 0) throw new Error('write failed: ' + result.stderr);
    if (!result.stdout.includes('weft-ok')) throw new Error('unexpected content: ' + result.stdout);
    rmSync(target, { force: true });
    return 'weft-ok';
  });

  await check('non-root identity', async () => {
    const result = await runner.run('id -u', args.timeoutMs);
    if (result.code !== 0) throw new Error('id failed: ' + result.stderr);
    const uid = result.stdout.trim();
    if (uid === '0') throw new Error('running as root');
    return 'uid=' + uid;
  }, args.backend === 'workspace-guard' || (args.backend === 'wsl' && (!args.wslUser || args.wslUser === 'default')));

  await check('network egress is denied', async () => {
    const code = 'node -e "fetch(\'https://example.com\').then(()=>process.exit(0)).catch(()=>process.exit(7))"';
    const result = await runner.run(code, args.timeoutMs);
    if (result.code === 0) throw new Error('network egress succeeded');
    return 'exit=' + result.code;
  }, args.backend === 'workspace-guard' || args.backend === 'wsl');

  await check('write outside workspace is denied', async () => {
    const code = 'node -e "require(\'fs\').writeFileSync(\'/etc/weft-conformance\',\'x\')"';
    const result = await runner.run(code, args.timeoutMs);
    if (result.code === 0) throw new Error('wrote /etc/weft-conformance');
    return 'exit=' + result.code;
  }, args.backend === 'workspace-guard' || args.backend === 'wsl');

  const failed = results.filter((r) => r.status === 'FAIL');
  console.log('WEFT SANDBOX CONFORMANCE backend=' + args.backend + ' workspace=' + workspace);
  for (const r of results) console.log('  ' + r.status.padEnd(4) + ' ' + r.name + ' — ' + r.detail);
  console.log('');
  if (failed.length > 0) {
    console.log('RESULT: FAIL (' + failed.length + ')');
    process.exitCode = 1;
    return;
  }
  console.log('RESULT: PASS');
}

main().catch((error) => {
  console.error('sandbox conformance unavailable: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 2;
});
