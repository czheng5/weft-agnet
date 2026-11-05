import { existsSync, readFileSync } from 'node:fs';

export interface CoverageReport {
  files: string[];
  lines: number;
  covered: number;
  linePercent: number;
}

export function parseVerilatorCoverageInfo(text: string): CoverageReport {
  const files = new Set<string>();
  const lines = new Set<string>();
  const covered = new Set<string>();
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('SF:')) { current = line.slice(3); files.add(current); }
    else if (line.startsWith('DA:')) {
      const [lineNo, countText] = line.slice(3).split(',');
      if (lineNo && countText !== undefined) {
        const key = current + ':' + lineNo;
        lines.add(key);
        if (Number(countText) > 0) covered.add(key);
      }
    }
  }
  const total = lines.size;
  return { files: [...files], lines: total, covered: covered.size, linePercent: total === 0 ? 0 : (covered.size / total) * 100 };
}

export function coverageGate(report: CoverageReport, thresholdPercent: number): { status: 'pass' | 'fail'; detail: string } {
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) throw new Error('coverage threshold must be 0..100');
  return report.linePercent >= thresholdPercent
    ? { status: 'pass', detail: report.linePercent.toFixed(2) + '% >= ' + thresholdPercent + '%' }
    : { status: 'fail', detail: report.linePercent.toFixed(2) + '% < ' + thresholdPercent + '%' };
}

export interface PercReport {
  violations: number | null;
  detail: string;
}

export function parsePercReport(text: string): PercReport {
  const match = text.match(/(?:violations?|violation_count|errors?)\s*[:=]\s*(\d+)/i);
  if (match) {
    const violations = Number(match[1]);
    return { violations, detail: violations === 0 ? 'PERC clean' : violations + ' PERC violation(s)' };
  }
  if (/\bno\s+(?:perc\s+)?violations?\b/i.test(text)) return { violations: 0, detail: 'PERC clean' };
  return { violations: null, detail: 'PERC report has no machine-readable violation count' };
}

export interface PercAdapter {
  evaluate(reportPath: string): PercReport;
}

export class FilePercAdapter implements PercAdapter {
  evaluate(reportPath: string): PercReport {
    if (!existsSync(reportPath)) return { violations: null, detail: 'PERC report not found: ' + reportPath };
    return parsePercReport(readFileSync(reportPath, 'utf8'));
  }
}
