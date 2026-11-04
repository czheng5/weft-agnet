export interface EvalCase {
  name: string;
  run: () => Promise<boolean> | boolean;
}

export interface EvalCaseResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface EvalReport {
  passed: boolean;
  results: EvalCaseResult[];
}

export async function runEvalSuite(cases: EvalCase[]): Promise<EvalReport> {
  const results: EvalCaseResult[] = [];
  for (const item of cases) {
    if (!item.name.trim()) {
      results.push({ name: item.name, passed: false, error: 'empty eval name' });
      continue;
    }
    try {
      const passed = await item.run();
      results.push({ name: item.name, passed: Boolean(passed) });
    } catch (error) {
      results.push({ name: item.name, passed: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { passed: results.length > 0 && results.every((item) => item.passed), results };
}
