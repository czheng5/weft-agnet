export interface BenchReport {
  iterations: number;
  errors: number;
  totalMs: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export async function runBench(iterations: number, fn: (index: number) => Promise<unknown>): Promise<BenchReport> {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('iterations must be positive');
  const samples: number[] = [];
  let errors = 0;
  const started = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    try {
      await fn(i);
    } catch {
      errors += 1;
    }
    samples.push(performance.now() - start);
  }
  const totalMs = performance.now() - started;
  samples.sort((a, b) => a - b);
  const percentile = (p: number): number => samples[Math.min(samples.length - 1, Math.max(0, Math.ceil(samples.length * p) - 1))];
  return {
    iterations,
    errors,
    totalMs,
    minMs: samples[0],
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: samples[samples.length - 1]
  };
}
