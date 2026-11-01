import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkGraph } from '../src/core/workgraph.ts';
import { GoalEvaluator, planFromWorkGraph, PlanStore } from '../src/core/goal.ts';
import { CheckpointStore, createCheckpoint } from '../src/core/checkpoint.ts';
import { ActorRuntime } from '../src/core/actors.ts';
import { EventBus } from '../src/core/event-bus.ts';
import { Scheduler } from '../src/core/scheduler.ts';
import { CapabilityRegistry } from '../src/core/capabilities.ts';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { MemoryHub } from '../src/core/memory-hub.ts';
import { InMemoryVectorIndex } from '../src/core/vector-index.ts';
import type { MemoryRecord } from '../src/core/memory.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(id: string, content: string): MemoryRecord {
  const now = Date.now();
  return {
    id,
    scope: { tenantId: 'demo', userId: 'demo', projectId: 'v1' },
    layer: 'semantic',
    kind: 'fact',
    content,
    provenance: 'agent_inferred',
    confidence: 0.9,
    sensitivity: 'internal',
    status: 'active',
    validFrom: now,
    version: 1,
    sourceEventIds: [],
    createdAt: now,
    updatedAt: now
  };
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'weft-v1-demo-'));
  const provider = new SqliteMemoryProvider(join(dir, 'memory.db'));
  const hub = new MemoryHub({
    provider,
    workspace: dir,
    embedding: {
      async embed(texts) {
        return texts.map((text) => text.includes('alpha') ? [1, 0] : [0, 1]);
      }
    },
    vectorIndex: new InMemoryVectorIndex()
  });
  try {
    const graph = new WorkGraph('ship Weft v1.0 demo');
    graph.goal.acceptance = ['demo evidence'];
    const a = graph.addTask({ title: 'build', acceptance: ['build ok'] });
    const b = graph.addTask({ title: 'verify', dependsOn: [a.id], acceptance: ['verify ok'] });
    graph.startTask(a.id);
    graph.completeTask(a.id, 'built');
    graph.startTask(b.id);
    graph.completeTask(b.id, 'verified');
    const evidence = [{ id: 'ev-demo', taskId: b.id, criterion: 'demo evidence', summary: 'all tasks done', passed: true, at: Date.now() }];
    const evaluation = new GoalEvaluator().evaluate(graph.goal, graph.allTasks(), evidence);
    if (!evaluation.done) throw new Error('goal evaluation failed');

    const plan = planFromWorkGraph(graph.goal, graph.allTasks(), evidence);
    const planStore = new PlanStore(dir);
    planStore.save(plan);
    const checkpointStore = new CheckpointStore(dir);
    checkpointStore.save(createCheckpoint(plan, 'v1-demo'));

    const actors = new ActorRuntime();
    const parent = actors.spawn({ name: 'planner', prefix: { system: 'demo', tools: ['read_file'] }, run: async () => 'planned' });
    const child = actors.fork(parent.id, { name: 'executor', run: async (ctx) => ctx.prefix?.system ?? 'missing' });
    const childPrefix = await actors.wait<string>(child.id);
    await actors.wait(parent.id);
    if (childPrefix !== 'demo') throw new Error('actor fork prefix failed');

    const bus = new EventBus();
    const events: string[] = [];
    bus.subscribe('lifecycle', (event) => { events.push(event.type); });
    await bus.publish('lifecycle', { step: 'demo' });

    const scheduler = new Scheduler();
    let fired = 0;
    scheduler.registerHandler('wake', () => { fired += 1; });
    scheduler.schedule({ id: 'wake-demo', kind: 'wakeup', handler: 'wake', at: Date.now() + 10 });
    scheduler.start();
    await delay(40);
    scheduler.stop();
    if (fired !== 1) throw new Error('scheduler failed');

    const capabilities = new CapabilityRegistry(dir);
    capabilities.install({ schemaVersion: 1, id: 'weft.demo', name: 'Demo', version: '1.0.0', tools: ['read_file'], permissions: ['fs:read'], eval: ['demo'] });

    await hub.write([record('alpha', 'alpha memory'), record('beta', 'beta related')]);
    const hits = await hub.search({ text: 'zzz', scope: { tenantId: 'demo', userId: 'demo', projectId: 'v1' }, topK: 5 });
    if (hits.length === 0) throw new Error('memory hub search failed');
    await hub.outbox.drain(async () => {});

    console.log('Weft v1.0 demo PASS');
    console.log('  goal=' + evaluation.done + ' tasks=' + graph.allTasks().length + ' evidence=' + evidence.length);
    console.log('  plan=' + plan.id.slice(0, 8) + ' checkpoint=' + checkpointStore.latest()?.id.slice(0, 8));
    console.log('  actor childPrefix=' + childPrefix + ' eventBus=' + events.length + ' schedulerFired=' + fired);
    console.log('  capability=' + capabilities.get('weft.demo')?.manifest.version + ' memoryHits=' + hits.length + ' outboxPending=' + hub.outbox.pending().length);
  } finally {
    await hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Weft v1.0 demo FAIL: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
