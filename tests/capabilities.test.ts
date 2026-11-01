import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CapabilityRegistry, CapabilityError } from '../src/core/capabilities.ts';

const manifest = {
  schemaVersion: 1 as const,
  id: 'weft.demo',
  name: 'Demo Skill',
  version: '1.0.0',
  description: 'demo',
  instructions: 'do the demo',
  tools: ['read_file'],
  permissions: ['fs:read'],
  eval: ['demo-eval']
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
    assert.throws(() => registry.enable('missing'), /unknown capability/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
