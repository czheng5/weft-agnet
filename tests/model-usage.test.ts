import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleModel } from '../src/core/model.ts';

test('OpenAI-compatible model maps cached_tokens to cacheReadTokens', async () => {
  let body = '';
  const model = new OpenAICompatibleModel({
    baseUrl: 'https://model.example/v1',
    apiKey: 'key',
    model: 'fake',
    fetchImpl: async (_input, init) => {
      body = String(init?.body ?? '');
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok', tool_calls: [] } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 80 } }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const response = await model.complete({
    system: 'sys',
    tools: [],
    messages: [{ role: 'user', content: 'hello' }]
  });
  assert.equal(response.content, 'ok');
  assert.equal(response.usage?.inputTokens, 100);
  assert.equal(response.usage?.outputTokens, 20);
  assert.equal(response.usage?.cacheReadTokens, 80);
  assert.match(body, /chat\/completions|fake/);
});
