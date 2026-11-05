import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

export interface DiscoveredTool {
  name: string;
  path: string;
  version?: string;
}

export interface ToolchainReport {
  tools: DiscoveredTool[];
  pdks: string[];
  searchPaths: string[];
}

const TOOL_NAMES = ['verilator', 'yosys', 'iverilog', 'vvp', 'verilator_coverage', 'opensta', 'sta', 'klayout', 'ngspice', 'xschem'];

function executable(path: string): boolean {
  try { return existsSync(path) && statSync(path).isFile(); } catch { return false; }
}

function pathCandidates(env: NodeJS.ProcessEnv, name: string): string[] {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  const roots = [
    env.WEFT_EDA_BIN,
    env.OSS_CAD_SUITE ? join(env.OSS_CAD_SUITE, 'bin') : undefined,
    env.VERILATOR_ROOT ? join(env.VERILATOR_ROOT, 'bin') : undefined,
    env.YOSYS_ROOT ? join(env.YOSYS_ROOT, 'bin') : undefined,
    env.PATH
  ];
  const out: string[] = [];
  for (const root of roots) {
    if (!root) continue;
    for (const dir of root.split(delimiter)) out.push(join(dir, exe));
  }
  if (process.platform === 'win32') out.push('C:\\eda\\bin\\' + exe, 'D:\\eda\\bin\\' + exe);
  return out;
}

function probePath(path: string): string | undefined {
  if (!executable(path)) return undefined;
  const result = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (result.error) return path;
  return path;
}

export function discoverToolchain(env: NodeJS.ProcessEnv = process.env): ToolchainReport {
  const tools: DiscoveredTool[] = [];
  const searchPaths = new Set<string>();
  for (const name of TOOL_NAMES) {
    const candidates = pathCandidates(env, name);
    for (const candidate of candidates) searchPaths.add(candidate);
    const found = candidates.map(probePath).find(Boolean);
    if (found) tools.push({ name, path: found });
  }
  const pdkRoots = [
    env.PDK_ROOT, env.PDK, env.OPENLANE_ROOT ? join(env.OPENLANE_ROOT, 'pdks') : undefined,
    join(homedir(), '.volare'), '/usr/share/pdk', '/opt/pdk'
  ].filter((item): item is string => Boolean(item));
  const pdks = pdkRoots.filter((path) => existsSync(path));
  return { tools, pdks, searchPaths: [...searchPaths] };
}

export function hasEdaTools(report: ToolchainReport): boolean {
  const names = new Set(report.tools.map((tool) => tool.name));
  return names.has('verilator') && names.has('yosys');
}
