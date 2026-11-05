import { createHash } from 'node:crypto';

export interface S3ObjectInput {
  Bucket: string;
  Key: string;
  Body: Buffer;
  ContentType?: string;
}

export interface S3GetResult {
  Body: Buffer | Uint8Array | string;
}

export interface S3ClientLike {
  putObject(input: S3ObjectInput): Promise<void>;
  getObject(bucket: string, key: string): Promise<S3GetResult | null>;
  headObject(bucket: string, key: string): Promise<boolean>;
}

export interface S3ArtifactStoreOptions {
  bucket: string;
  prefix?: string;
  client: S3ClientLike;
}

export class S3ArtifactStore {
  readonly bucket: string;
  readonly prefix: string;
  private readonly client: S3ClientLike;

  constructor(opts: S3ArtifactStoreOptions) {
    if (!opts.bucket.trim()) throw new Error('s3 bucket is required');
    this.bucket = opts.bucket;
    this.prefix = (opts.prefix ?? 'weft/artifacts').replace(/^\/+|\/+$/g, '');
    this.client = opts.client;
  }

  private keyFor(digest: string): string {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid artifact digest');
    return this.prefix + '/' + digest.slice(0, 2) + '/' + digest;
  }

  async put(bytes: Buffer | string): Promise<{ digest: string; path: string }> {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
    const digest = createHash('sha256').update(buffer).digest('hex');
    const key = this.keyFor(digest);
    if (!(await this.client.headObject(this.bucket, key))) {
      await this.client.putObject({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: 'application/octet-stream' });
    }
    return { digest, path: 's3://' + this.bucket + '/' + key };
  }

  async get(digest: string): Promise<Buffer | null> {
    const key = this.keyFor(digest);
    const object = await this.client.getObject(this.bucket, key);
    if (!object) return null;
    return Buffer.isBuffer(object.Body) ? object.Body : Buffer.from(object.Body);
  }

  async has(digest: string): Promise<boolean> {
    return this.client.headObject(this.bucket, this.keyFor(digest));
  }
}
