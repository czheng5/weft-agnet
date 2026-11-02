import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '../src/core/session.ts';
import { WorkspaceGuard, ShellSandbox } from '../src/core/sandbox.ts';
import { PolicyEngine, ApprovalService } from '../src/core/permissions.ts';
import { SqliteMemoryProvider } from '../src/core/memory.ts';
import { LocalDocsProvider } from '../src/core/kb.ts';
import { OpenAICompatibleModel } from '../src/core/model.ts';
import { AgentLoop } from '../src/core/agent.ts';
import type { ToolContext } from '../src/core/tools.ts';

test('agent over local HTTP model reports cacheReadTokens and runs tools', async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += String(chunk); });
    req.on('end', () => {
      calls += 1;
      const hasToolResult = body.includes('"role":"tool"');
      const message = hasToolResult
        ? { content: 'http demo done', tool_calls: [] }
        : {
            content: '',
            tool_calls: [{
              id: 'call-http-1',
              type: 'function',
              function: { name: 'write_file', arguments: JSON.stringify({ path: 'http-demo.txt', content: 'ok' }) }
            }]
          };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message }],
        usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 64 } }
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const workspace = mkdtempSync(join(tmpdir(), 'weft-agent-http-'));
  let memory: SqliteMemoryProvider | undefined;
  try {
    const session = new Session(workspace);
    const guard = new WorkspaceGuard(workspace);
    const policy = new PolicyEngine({ workspace, mode: 'workspace-write', approvalPolicy: 'on-request' });
    const approvals = new ApprovalService(policy, async () => 'allow-session');
    const sandbox = new ShellSandbox(guard, 'workspace-write');
    memory = new SqliteMemoryProvider(join(workspace, '.weft', 'memory.db'));
    const kb = new LocalDocsProvider([workspace]);
    const toolContext: ToolContext = {
      session, guard, sandbox, approvals, memory, kb,
      scope: { tenantId: 'local', userId: 'default', projectId: 'weft' },
      workspace
    };
    const model = new OpenAICompatibleModel({ baseUrl: 'http://127.0.0.1:' + port + '/v1', apiKey: 'key', model: 'mock' });
    const agent = new AgentLoop({ model, session, toolContext });
    const result = await agent.run('write http-demo.txt');
    assert.equal(result.content, 'http demo done');
    assert.equal(result.cacheReadTokens, 128);
    assert.equal(existsSync(join(workspace, 'http-demo.txt')), true);
    assert.equal(readFileSync(join(workspace, 'http-demo.txt'), 'utf8'), 'ok');
    assert.equal(session.events().filter((event) => event.type === 'model/usage').length, 2);
    assert.equal(calls >= 2, true);
  } finally {
    memory?.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(workspace, { recursive: true, force: true });
  }
});
