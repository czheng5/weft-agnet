#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'src', 'cli.ts');
const child = spawn(process.execPath, ['--experimental-strip-types', cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  process.stderr.write('weft launcher: ' + (error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
