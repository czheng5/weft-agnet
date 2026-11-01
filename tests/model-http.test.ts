import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenAICompatibleModel } from '../src/core/model.ts';

test('OpenAI-compatible model over local HTTP maps usage', async () => {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += String(chunk); });
    req.on('end', () => {
      const text = JSON.stringify({
        choices: [{ message: { content: 'http-ok', tool_calls: [] } }],
        usage: { prompt_tokens: 30, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 24 } }
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(text);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const model = new OpenAICompatibleModel({ baseUrl: 'http://127.0.0.1:' + port + '/v1', apiKey: 'key', model: 'mock' });
    const response = await model.complete({ system: 's', tools: [], messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(response.content, 'http-ok');
    assert.equal(response.usage?.cacheReadTokens, 24);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
