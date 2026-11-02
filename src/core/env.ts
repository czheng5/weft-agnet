import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface LoadEnvResult {
  loaded: boolean;
  keys: string[];
  path: string;
}

export function loadEnvFile(path = '.env', override = false): LoadEnvResult {
  const full = resolve(path);
  if (!existsSync(full)) return { loaded: false, keys: [], path: full };
  const keys: string[] = [];
  for (const rawLine of readFileSync(full, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!override && process.env[key] !== undefined) continue;
    process.env[key] = value;
    keys.push(key);
  }
  return { loaded: true, keys, path: full };
}
