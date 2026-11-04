import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteRuntimeStore } from '../src/core/runtime-store-sqlite.ts';
import { AgentGateway } from '../src/core/gateway.ts';
import { runBench } from '../src/core/bench.ts';

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'weft-bench-'));
  const store = new SqliteRuntimeStore(join(dir, 'runtime.db'));
  const scope = { tenantId: 'bench', projectId: 'weft', workspaceId: dir };
  const gateway = new AgentGateway({ store, scope });
  try {
    const base = (await gateway.start(0)).url;
    const report = await runBench(50, async (index) => {
      const created = await fetch(base + '/threads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'bench-' + index }) });
      if (created.status !== 201) throw new Error('thread HTTP ' + created.status);
      const body = await created.json() as { thread: { id: string } };
      const message = await fetch(base + '/threads/' + body.thread.id + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'bench' }) });
      if (message.status !== 202) throw new Error('message HTTP ' + message.status);
    });
    console.log('WEFT BENCH PASS');
    console.log('  iterations=' + report.iterations + ' errors=' + report.errors);
    console.log('  p50=' + report.p50Ms.toFixed(2) + 'ms p95=' + report.p95Ms.toFixed(2) + 'ms max=' + report.maxMs.toFixed(2) + 'ms');
  } finally {
    await gateway.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('WEFT BENCH FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
