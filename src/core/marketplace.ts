import { sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
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

export interface PublisherKey {
  id: string;
  publicKeyPem: string;
  revokedAt?: number;
}

export interface SignedCapabilityBundle extends CapabilityBundle {
  publisher: string;
  keyId: string;
  signature: string;
  expiresAt?: number;
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

function signaturePayload(bundle: CapabilityBundle, publisher: string, keyId: string, expiresAt?: number): Buffer {
  return Buffer.from(canonicalJson({ sha256: bundle.sha256, publisher, keyId, expiresAt: expiresAt ?? null }), 'utf8');
}

export function signCapabilityBundle(bundle: CapabilityBundle, privateKeyPem: string, publisher: string, keyId: string, expiresAt?: number): SignedCapabilityBundle {
  verifyCapabilityBundle(bundle);
  if (!publisher.trim() || !keyId.trim()) throw new BundleError('publisher/keyId required');
  const signature = cryptoSign(null, signaturePayload(bundle, publisher, keyId, expiresAt), privateKeyPem).toString('base64');
  return { ...bundle, publisher, keyId, signature, expiresAt };
}

export function verifySignedCapabilityBundle(bundle: SignedCapabilityBundle, keys: PublisherKey[], now = Date.now()): void {
  verifyCapabilityBundle(bundle);
  if (!bundle.publisher.trim() || !bundle.keyId.trim()) throw new BundleError('publisher/keyId required');
  if (bundle.expiresAt !== undefined && bundle.expiresAt <= now) throw new BundleError('bundle expired');
  const key = keys.find((item) => item.id === bundle.keyId);
  if (!key) throw new BundleError('unknown publisher key');
  if (key.revokedAt !== undefined && key.revokedAt <= now) throw new BundleError('publisher key revoked');
  let valid = false;
  try {
    valid = cryptoVerify(null, signaturePayload(bundle, bundle.publisher, bundle.keyId, bundle.expiresAt), key.publicKeyPem, Buffer.from(bundle.signature, 'base64'));
  } catch {
    valid = false;
  }
  if (!valid) throw new BundleError('publisher signature invalid');
}

export async function installCapabilityBundle(store: RuntimeStore, bundle: CapabilityBundle): Promise<CapabilityManifest[]> {
  verifyCapabilityBundle(bundle);
  for (const manifest of bundle.manifests) await store.putCapability(manifest);
  return bundle.manifests.map((manifest) => ({ ...manifest }));
}

export async function installSignedCapabilityBundle(store: RuntimeStore, bundle: SignedCapabilityBundle, keys: PublisherKey[], now = Date.now()): Promise<CapabilityManifest[]> {
  verifySignedCapabilityBundle(bundle, keys, now);
  return installCapabilityBundle(store, bundle);
}

export async function fetchSignedMarketplaceIndex(url: string, keys: PublisherKey[], fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<SignedCapabilityBundle[]> {
  if (!/^https?:\/\//.test(url)) throw new BundleError('marketplace URL must be http(s)');
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new BundleError('marketplace returned HTTP ' + response.status);
  const payload = await response.json() as unknown;
  const list = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && Array.isArray((payload as { bundles?: unknown }).bundles) ? (payload as { bundles: unknown[] }).bundles : [];
  const bundles = list.map((item) => item as SignedCapabilityBundle);
  for (const bundle of bundles) verifySignedCapabilityBundle(bundle, keys, now);
  return bundles;
}
