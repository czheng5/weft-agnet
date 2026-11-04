import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRegistry, ModelRegistryError } from '../src/core/model-registry.ts';

test('model registry persists providers without storing secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-model-'));
  try {
    const registry = new ModelRegistry(dir);
    const profile = registry.upsert({ id: 'deepseek', name: 'DeepSeek', kind: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKeyEnv: 'DEEPSEEK_API_KEY' });
    assert.equal(profile.apiKeyEnv, 'DEEPSEEK_API_KEY');
    assert.equal(registry.resolveApiKey('deepseek', { DEEPSEEK_API_KEY: 'sk-test' }), 'sk-test');
    const reloaded = new ModelRegistry(dir);
    assert.equal(reloaded.get('deepseek')?.model, 'deepseek-chat');
    const raw = readFileSync(join(dir, '.weft', 'models.json'), 'utf8');
    assert.equal(raw.includes('sk-test'), false);
    assert.equal(reloaded.remove('deepseek'), true);
    assert.equal(reloaded.get('deepseek'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('model registry rejects unsafe profiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-model-'));
  try {
    const registry = new ModelRegistry(dir);
    assert.throws(() => registry.upsert({ id: '', name: 'x', kind: 'local', baseUrl: 'http://localhost', model: 'm' }), ModelRegistryError);
    assert.throws(() => registry.upsert({ id: 'x', name: 'x', kind: 'local', baseUrl: 'file:///tmp', model: 'm' }), ModelRegistryError);
    assert.throws(() => registry.upsert({ id: 'x', name: 'x', kind: 'local', baseUrl: 'http://localhost', model: 'm', apiKeyEnv: 'not-a-name' }), ModelRegistryError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
