import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export interface ClosedWorldFile {
  path: string;
  content: string;
  lineCount: number;
}

export interface ExpectedFinding {
  id: string;
  keywords: string[];
  evidencePath?: string;
}

export interface ClosedWorldScenario {
  dir: string;
  id: string;
  domain: string;
  title: string;
  prompt: string;
  files: ClosedWorldFile[];
  expectedFindings: ExpectedFinding[];
  expectedPatchKeywords: string[];
  forbidden: string[];
}

export interface SubmissionFinding {
  id: string;
  claim: string;
  evidence: Array<{ path: string; line: number }>;
}

export interface AnalystSubmission {
  summary: string;
  findings: SubmissionFinding[];
  patch?: string;
}

export interface ScenarioCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface ScenarioResult {
  scenarioId: string;
  passed: boolean;
  checks: ScenarioCheck[];
  score: number;
}

export class ClosedWorldError extends Error {
  constructor(message: string) {
    super('closed-world: ' + message);
    this.name = 'ClosedWorldError';
  }
}

function safeRelativePath(path: string): string {
  if (!path.trim()) throw new ClosedWorldError('empty file path');
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) throw new ClosedWorldError('absolute path rejected: ' + path);
  if (/^[a-z]+:\/\//i.test(path)) throw new ClosedWorldError('URL rejected: ' + path);
  const parts = path.split(/[\\/]+/);
  if (parts.includes('..')) throw new ClosedWorldError('path traversal rejected: ' + path);
  return parts.join('/');
}

function readScenarioFile(root: string, scenarioDir: string, file: string): ClosedWorldFile {
  const safe = safeRelativePath(file);
  const absolute = resolve(root, scenarioDir, safe);
  const rootResolved = resolve(root);
  if (absolute !== rootResolved && !absolute.startsWith(rootResolved + sep)) throw new ClosedWorldError('path escapes root: ' + file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new ClosedWorldError('missing file: ' + file);
  const content = readFileSync(absolute, 'utf8');
  return { path: safe, content, lineCount: content.split(/\r?\n/).length };
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) throw new ClosedWorldError(field + ' must be string[]');
  return value as string[];
}

export function loadClosedWorldScenario(root: string, scenarioDir: string): ClosedWorldScenario {
  const manifestPath = join(root, scenarioDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new ClosedWorldError('missing manifest: ' + scenarioDir);
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.domain !== 'string' || typeof raw.title !== 'string' || typeof raw.prompt !== 'string') {
    throw new ClosedWorldError('manifest requires id/domain/title/prompt');
  }
  const files = stringArray(raw.files, 'files').map((file) => readScenarioFile(root, scenarioDir, file));
  const expectedRaw = raw.expectedFindings;
  if (!Array.isArray(expectedRaw) || expectedRaw.length === 0) throw new ClosedWorldError('expectedFindings required');
  const expectedFindings: ExpectedFinding[] = expectedRaw.map((item) => {
    const finding = item as Record<string, unknown>;
    if (typeof finding.id !== 'string' || !finding.id.trim()) throw new ClosedWorldError('finding id required');
    const keywords = stringArray(finding.keywords, 'finding.keywords');
    return {
      id: finding.id,
      keywords,
      evidencePath: typeof finding.evidencePath === 'string' ? safeRelativePath(finding.evidencePath) : undefined
    };
  });
  return {
    dir: scenarioDir,
    id: raw.id,
    domain: raw.domain,
    title: raw.title,
    prompt: raw.prompt,
    files,
    expectedFindings,
    expectedPatchKeywords: raw.expectedPatchKeywords === undefined ? [] : stringArray(raw.expectedPatchKeywords, 'expectedPatchKeywords'),
    forbidden: raw.forbidden === undefined ? [] : stringArray(raw.forbidden, 'forbidden')
  };
}

export function loadClosedWorldSuite(root: string): ClosedWorldScenario[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((dir) => loadClosedWorldScenario(root, dir));
}

export function evaluateScenario(scenario: ClosedWorldScenario, submission: AnalystSubmission): ScenarioResult {
  const checks: ScenarioCheck[] = [];
  const add = (id: string, passed: boolean, detail: string): void => { checks.push({ id, passed, detail }); };
  add('summary', typeof submission.summary === 'string' && submission.summary.trim().length > 0, 'non-empty summary');
  const serialized = JSON.stringify(submission).toLowerCase();
  for (const forbidden of scenario.forbidden) {
    add('forbidden:' + forbidden, !serialized.includes(forbidden.toLowerCase()), 'submission must not contain ' + forbidden);
  }
  const findings = Array.isArray(submission.findings) ? submission.findings : [];
  for (const expected of scenario.expectedFindings) {
    const matches = findings.filter((finding) => finding.id === expected.id);
    add('finding:' + expected.id, matches.length === 1, 'exactly one finding with id ' + expected.id);
    const finding = matches[0];
    if (!finding) continue;
    add('claim:' + expected.id, expected.keywords.every((keyword) => finding.claim.toLowerCase().includes(keyword.toLowerCase())), 'claim mentions ' + expected.keywords.join(', '));
    const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];
    let evidenceOk = evidence.length > 0;
    let evidenceDetail = 'at least one evidence citation';
    for (const cite of evidence) {
      const file = scenario.files.find((item) => item.path === cite.path);
      if (!file || !Number.isInteger(cite.line) || cite.line < 1 || cite.line > file.lineCount) {
        evidenceOk = false;
        evidenceDetail = 'invalid citation ' + cite.path + ':' + cite.line;
      } else if (expected.evidencePath && cite.path !== expected.evidencePath) {
        evidenceOk = false;
        evidenceDetail = 'citation must point to ' + expected.evidencePath;
      }
    }
    add('evidence:' + expected.id, evidenceOk, evidenceDetail);
  }
  if (scenario.expectedPatchKeywords.length > 0) {
    const patch = typeof submission.patch === 'string' ? submission.patch.toLowerCase() : '';
    add('patch', scenario.expectedPatchKeywords.every((keyword) => patch.includes(keyword.toLowerCase())), 'patch includes ' + scenario.expectedPatchKeywords.join(', '));
  }
  return { scenarioId: scenario.id, passed: checks.every((check) => check.passed), checks, score: checks.filter((check) => check.passed).length / Math.max(1, checks.length) };
}

export function loadReferenceSubmission(root: string, scenarioDir: string): AnalystSubmission {
  return JSON.parse(readFileSync(join(root, scenarioDir, 'reference.json'), 'utf8')) as AnalystSubmission;
}

export function relativeScenarioPath(root: string, scenario: ClosedWorldScenario): string {
  return relative(root, join(root, scenario.dir));
}
