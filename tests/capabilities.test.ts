import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CapabilityRegistry, CapabilityError } from '../src/core/capabilities.ts';
import type { CapabilityManifest } from '../src/core/runtime-schema.ts';

const manifest: CapabilityManifest = {
  schemaVersion: 1,
  id: 'weft.demo',
  name: 'Demo Skill',
  version: '1.0.0',
  description: 'demo',
  instructions: 'do the demo',
  tools: ['read_file'],
  permissions: { read: ['fs:read'], write: [], exec: [], network: [] },
  sandbox: 'any',
  evals: ['demo-eval']
};

test('CapabilityRegistry install/list/enable/disable/uninstall/persist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cap-'));
  try {
    const registry = new CapabilityRegistry(dir);
    const record = registry.install(manifest);
    assert.equal(record.enabled, true);
    assert.equal(registry.get('weft.demo')?.manifest.version, '1.0.0');
    assert.equal(registry.list().length, 1);
    registry.disable('weft.demo');
    assert.equal(registry.list(true).length, 0);
    registry.enable('weft.demo');
    assert.equal(registry.list(true).length, 1);

    const reloaded = new CapabilityRegistry(dir);
    assert.equal(reloaded.get('weft.demo')?.manifest.name, 'Demo Skill');
    assert.equal(reloaded.get('weft.demo')?.manifest.permissions.read[0], 'fs:read');
    assert.equal(reloaded.uninstall('weft.demo'), true);
    assert.equal(reloaded.get('weft.demo'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CapabilityRegistry rejects invalid manifests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cap-'));
  try {
    const registry = new CapabilityRegistry(dir);
    assert.throws(() => registry.install({ ...manifest, version: 'bad' }), (e: unknown) => e instanceof CapabilityError);
    assert.throws(() => registry.install({ ...manifest, id: '' }), CapabilityError);
    assert.throws(() => registry.install({ ...manifest, name: '' }), CapabilityError);
    assert.throws(() => registry.enable('missing'), /unknown capability/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CapabilityRegistry reads v1 legacy manifest and migrates on write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-cap-'));
  try {
    const weft = join(dir, '.weft');
    mkdirSync(weft, { recursive: true });
    writeFileSync(join(weft, 'capabilities.json'), JSON.stringify({
      version: 1,
      capabilities: [{
        enabled: true,
        installedAt: 1000,
        manifest: {
          schemaVersion: 1, id: 'legacy.demo', name: 'Legacy', version: '1.0.0',
          description: 'old', tools: ['read_file'], permissions: ['fs:read', 'fs:write', 'net:http'], eval: ['legacy-eval']
        }
      }]
    }), 'utf8');
    const registry = new CapabilityRegistry(dir);
    const legacy = registry.get('legacy.demo');
    assert.equal(legacy?.manifest.name, 'Legacy');
    assert.equal(legacy?.manifest.sandbox, 'any');
    assert.deepEqual(legacy?.manifest.permissions.write, ['**']);
    assert.deepEqual(legacy?.manifest.permissions.network, ['**']);
    registry.disable('legacy.demo');
    const persisted = JSON.parse(readFileSync(join(weft, 'capabilities.json'), 'utf8'));
    assert.equal(persisted.version, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
