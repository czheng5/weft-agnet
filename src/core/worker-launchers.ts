export interface CommandRunner {
  run(command: string, args: string[], input?: string): Promise<{ ok: boolean; output: string }>;
}

export interface WorkerEnv {
  name: string;
  value?: string;
  secretName?: string;
  secretKey?: string;
}

export interface WorkerLaunchRequest {
  deploymentId: string;
  workerId: string;
  image: string;
  env: WorkerEnv[];
  command?: string[];
}

export interface LaunchedWorker {
  id: string;
  backend: 'kubernetes' | 'nomad';
  detail: string;
}

function commandRunner(): CommandRunner {
  return {
    async run() {
      throw new Error('no cluster command runner configured; inject a runner');
    }
  };
}

export class KubernetesLauncher {
  private readonly namespace: string;
  private readonly runner: CommandRunner;
  private readonly image: string;

  constructor(opts: { namespace?: string; image: string; runner?: CommandRunner }) {
    this.namespace = opts.namespace ?? 'weft';
    this.image = opts.image;
    this.runner = opts.runner ?? commandRunner();
  }

  manifest(req: WorkerLaunchRequest): Record<string, unknown> {
    const env = req.env.map((item) => item.secretName && item.secretKey
      ? { name: item.name, valueFrom: { secretKeyRef: { name: item.secretName, key: item.secretKey } } }
      : { name: item.name, value: item.value ?? '' });
    return {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: 'weft-' + req.workerId, namespace: this.namespace, labels: { app: 'weft-worker', deployment: req.deploymentId } },
      spec: {
        backoffLimit: 0,
        template: {
          metadata: { labels: { app: 'weft-worker', deployment: req.deploymentId } },
          spec: {
            restartPolicy: 'Never',
            containers: [{ name: 'worker', image: req.image || this.image, command: req.command, env }]
          }
        }
      }
    };
  }

  async launch(req: WorkerLaunchRequest): Promise<LaunchedWorker> {
    const result = await this.runner.run('kubectl', ['apply', '-n', this.namespace, '-f', '-'], JSON.stringify(this.manifest(req)));
    if (!result.ok) throw new Error('kubectl apply failed: ' + result.output.slice(0, 300));
    return { id: req.workerId, backend: 'kubernetes', detail: result.output.slice(0, 300) };
  }

  async stop(workerId: string): Promise<void> {
    const result = await this.runner.run('kubectl', ['delete', 'job', 'weft-' + workerId, '-n', this.namespace, '--ignore-not-found']);
    if (!result.ok) throw new Error('kubectl delete failed: ' + result.output.slice(0, 300));
  }
}

export class NomadLauncher {
  private readonly runner: CommandRunner;
  private readonly image: string;
  private readonly datacenter: string;

  constructor(opts: { image: string; datacenter?: string; runner?: CommandRunner }) {
    this.image = opts.image;
    this.datacenter = opts.datacenter ?? 'dc1';
    this.runner = opts.runner ?? commandRunner();
  }

  jobSpec(req: WorkerLaunchRequest): Record<string, unknown> {
    const env = Object.fromEntries(req.env.map((item) => [item.name, item.value ?? '']));
    return {
      Job: {
        ID: 'weft-' + req.workerId,
        Name: 'weft-' + req.workerId,
        Type: 'batch',
        Datacenters: [this.datacenter],
        TaskGroups: [{
          Name: 'worker',
          Count: 1,
          Tasks: [{
            Name: 'worker',
            Driver: 'docker',
            Config: { image: req.image || this.image, command: req.command?.join(' ') },
            Env: env
          }]
        }]
      }
    };
  }

  async launch(req: WorkerLaunchRequest): Promise<LaunchedWorker> {
    const result = await this.runner.run('nomad', ['job', 'run', '-'], JSON.stringify(this.jobSpec(req)));
    if (!result.ok) throw new Error('nomad job run failed: ' + result.output.slice(0, 300));
    return { id: req.workerId, backend: 'nomad', detail: result.output.slice(0, 300) };
  }

  async stop(workerId: string): Promise<void> {
    const result = await this.runner.run('nomad', ['job', 'stop', '-purge', 'weft-' + workerId]);
    if (!result.ok) throw new Error('nomad job stop failed: ' + result.output.slice(0, 300));
  }
}
