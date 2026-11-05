import test from 'node:test';
import assert from 'node:assert/strict';
import { S3ArtifactStore } from '../src/core/artifact-s3.ts';
import type { S3ClientLike } from '../src/core/artifact-s3.ts';

function fakeClient(): S3ClientLike & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    async putObject(input) { objects.set(input.Key, input.Body); },
    async getObject(_bucket, key) { const body = objects.get(key); return body ? { Body: body } : null; },
    async headObject(_bucket, key) { return objects.has(key); }
  };
}

test('S3 artifact store is content addressed and idempotent', async () => {
  const client = fakeClient();
  const store = new S3ArtifactStore({ bucket: 'weft-test', prefix: 'artifacts', client });
  const first = await store.put('hello');
  const second = await store.put('hello');
  assert.equal(first.digest, second.digest);
  assert.match(first.path, /^s3:\/\/weft-test\/artifacts\/../);
  assert.equal((await store.get(first.digest))?.toString(), 'hello');
  assert.equal(await store.has(first.digest), true);
  assert.equal(await store.has('0'.repeat(64)), false);
  assert.equal(client.objects.size, 1);
});
