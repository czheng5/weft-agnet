import { canonicalJson, sha256 } from './request.ts';
import { validateCapabilityManifest } from './runtime-schema.ts';
import type { CapabilityManifest } from './runtime-schema.ts';
import type { RuntimeStore } from './runtime-store.ts';

export interface CapabilityBundle {
  schemaVersion: 1;
  id: string;
  version: string;
  manifests: CapabilityManifest[];
  sha256: string;
}

export class BundleError extends Error {
  constructor(message: string) {
    super('capability bundle: ' + message);
    this.name = 'BundleError';
  }
}

function hashManifests(manifests: CapabilityManifest[]): string {
  return sha256(canonicalJson(manifests));
}

export function createCapabilityBundle(id: string, version: string, manifests: CapabilityManifest[]): CapabilityBundle {
  if (!id.trim() || !version.trim()) throw new BundleError('id/version required');
  if (manifests.length === 0) throw new BundleError('bundle is empty');
  const normalized = manifests.map((manifest) => validateCapabilityManifest(manifest));
  return { schemaVersion: 1, id, version, manifests: normalized, sha256: hashManifests(normalized) };
}

export function verifyCapabilityBundle(bundle: CapabilityBundle): void {
  if (bundle.schemaVersion !== 1) throw new BundleError('unsupported schemaVersion');
  if (!bundle.id.trim() || !bundle.version.trim()) throw new BundleError('id/version required');
  if (!Array.isArray(bundle.manifests) || bundle.manifests.length === 0) throw new BundleError('bundle is empty');
  const normalized = bundle.manifests.map((manifest) => validateCapabilityManifest(manifest));
  if (hashManifests(normalized) !== bundle.sha256) throw new BundleError('checksum mismatch');
}

export async function installCapabilityBundle(store: RuntimeStore, bundle: CapabilityBundle): Promise<CapabilityManifest[]> {
  verifyCapabilityBundle(bundle);
  for (const manifest of bundle.manifests) await store.putCapability(manifest);
  return bundle.manifests.map((manifest) => ({ ...manifest }));
}
