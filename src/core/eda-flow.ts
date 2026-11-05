import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverToolchain } from './tool-discovery.ts';
import { FilePercAdapter, coverageGate, parseVerilatorCoverageInfo } from './eda-evidence.ts';

export type GateStatus = 'pass' | 'fail' | 'blocked' | 'unverified';

export interface EdaTool {
  name: string;
  available: boolean;
  path?: string;
  version?: string;
}

export interface EdaGate {
  id: string;
  status: GateStatus;
  detail: string;
}

export interface EdaManifest {
  scenario: string;
  top: string;
  rtl: string[];
  testbench: string;
  tbTop: string;
  coverage?: { tool: string; linePercent: number };
  perc?: { mode: string; detail: string; report?: string };
}

export interface EdaResult {
  scenario: string;
  status: GateStatus;
  gates: EdaGate[];
  tools: EdaTool[];
  limitations: string[];
}

function probe(name: string): EdaTool {
  const result = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (result.error || result.status !== 0) return { name, available: false };
  return { name, available: true, version: (result.stdout || result.stderr || '').split(/\r?\n/)[0]?.trim() };
}

export function discoverEdaTools(env: NodeJS.ProcessEnv = process.env): EdaTool[] {
  const report = discoverToolchain(env);
  return ['verilator', 'yosys', 'iverilog', 'verilator_coverage'].map((name) => {
    const found = report.tools.find((tool) => tool.name === name);
    return found ? { name, available: true, path: found.path } : probe(name);
  });
}

export function loadEdaManifest(scenarioDir: string): EdaManifest {
  const path = join(scenarioDir, 'eda.json');
  if (!existsSync(path)) throw new Error('missing eda.json: ' + scenarioDir);
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as EdaManifest;
  if (!manifest.scenario || !manifest.top || !manifest.testbench || !manifest.tbTop || !Array.isArray(manifest.rtl) || manifest.rtl.length === 0) throw new Error('invalid eda manifest');
  return manifest;
}

function run(command: string, args: string[], cwd: string): { ok: boolean; output: string } {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000 });
  return { ok: !result.error && result.status === 0, output: (result.stdout ?? '') + (result.stderr ?? '') };
}

export function evaluateEdaManifest(scenarioDir: string, manifest: EdaManifest, env: NodeJS.ProcessEnv = process.env): EdaResult {
  const tools = discoverEdaTools(env);
  const missing = tools.filter((tool) => !tool.available).map((tool) => tool.name);
  const limitations = [
    'PERC/electrical rule checking requires a configured rule deck; a bundled open-source deck is not claimed.',
    'Coverage percentage parsing is not enabled in this baseline.'
  ];
  if (missing.length > 0) {
    return {
      scenario: manifest.scenario,
      status: 'blocked',
      gates: [
        { id: 'toolchain', status: 'blocked', detail: 'missing: ' + missing.join(', ') },
        { id: 'functional', status: 'blocked', detail: 'simulation not run' },
        { id: 'coverage', status: 'blocked', detail: 'coverage not run' },
        { id: 'synthesis', status: 'blocked', detail: 'synthesis not run' },
        { id: 'perc', status: 'unverified', detail: manifest.perc?.detail ?? 'no PERC deck configured' }
      ],
      tools,
      limitations
    };
  }

  const rtl = manifest.rtl.map((file) => resolve(scenarioDir, file));
  const testbench = resolve(scenarioDir, manifest.testbench);
  const build = join(scenarioDir, 'build');
  mkdirSync(build, { recursive: true });
  const lint = run('verilator', ['--lint-only', '-Wall', '--top-module', manifest.top, ...rtl, testbench], scenarioDir);
  const simBuild = run('verilator', ['--binary', '--timing', '--coverage', '-j', '0', '--top-module', manifest.tbTop, '--Mdir', join(build, 'sim'), ...rtl, testbench], scenarioDir);
  let simOk = false;
  let simOutput = 'not run';
  if (simBuild.ok) {
    const binary = process.platform === 'win32' ? join(build, 'sim', 'V' + manifest.tbTop + '.exe') : join(build, 'sim', 'V' + manifest.tbTop);
    const sim = run(binary, [], scenarioDir);
    simOk = sim.ok;
    simOutput = sim.output;
  } else {
    simOutput = simBuild.output;
  }
  const yosysScript = 'read_verilog ' + rtl.map((file) => JSON.stringify(file)).join(' ') + '; synth -top ' + manifest.top + '; write_json ' + JSON.stringify(join(build, 'netlist.json'));
  const synth = run('yosys', ['-p', yosysScript], scenarioDir);

  let coverageStatus: GateStatus = 'unverified';
  let coverageDetail = 'coverage artifact not produced';
  const coverageDat = join(build, 'sim', 'coverage.dat');
  const coverageInfo = join(build, 'coverage.info');
  if (simOk && existsSync(coverageDat)) {
    const convert = run('verilator_coverage', ['--write-info', coverageInfo, coverageDat], scenarioDir);
    if (convert.ok && existsSync(coverageInfo) && manifest.coverage) {
      const gate = coverageGate(parseVerilatorCoverageInfo(readFileSync(coverageInfo, 'utf8')), manifest.coverage.linePercent);
      coverageStatus = gate.status;
      coverageDetail = gate.detail;
    } else {
      coverageDetail = 'coverage conversion failed or threshold missing';
    }
  }

  let percStatus: GateStatus = 'unverified';
  let percDetail = manifest.perc?.detail ?? 'no PERC deck configured';
  if (manifest.perc?.report) {
    const perc = new FilePercAdapter().evaluate(resolve(scenarioDir, manifest.perc.report));
    if (perc.violations === null) percDetail = perc.detail;
    else {
      percStatus = perc.violations === 0 ? 'pass' : 'fail';
      percDetail = perc.detail;
    }
  }

  const gates: EdaGate[] = [
    { id: 'lint', status: lint.ok ? 'pass' : 'fail', detail: lint.ok ? 'verilator lint clean' : lint.output.slice(0, 500) },
    { id: 'functional', status: simOk ? 'pass' : 'fail', detail: simOk ? 'testbench passed' : simOutput.slice(0, 500) },
    { id: 'coverage', status: coverageStatus, detail: coverageDetail },
    { id: 'synthesis', status: synth.ok ? 'pass' : 'fail', detail: synth.ok ? 'yosys netlist generated' : synth.output.slice(0, 500) },
    { id: 'perc', status: percStatus, detail: percDetail }
  ];
  const status = gates.every((gate) => gate.status === 'pass') ? 'pass' : gates.some((gate) => gate.status === 'fail') ? 'fail' : 'blocked';
  return { scenario: manifest.scenario, status, gates, tools, limitations };
}
