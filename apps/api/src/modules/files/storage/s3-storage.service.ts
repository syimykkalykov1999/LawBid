import {
  Injectable,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../../common/secrets/secrets.service';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { BucketKind } from '../files.policy';

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface ObjectHead {
  size: number;
  contentType?: string;
}

/**
 * Thin S3 wrapper (AWS S3 in staging/prod with the task's IAM role; local
 * MinIO when S3_ENDPOINT is set — docs/KEYS_SETUP.md #15). Both buckets are
 * private: nothing here ever sets an ACL or bucket policy, every read goes
 * through a short-lived signature (docs/02 §1.6, docs/03 §2.2).
 */
@Injectable()
export class S3StorageService implements OnModuleDestroy {
  private client?: S3Client;
  private buckets?: Record<BucketKind, string>;
  private fingerprint = '';

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() private readonly secrets?: SecretsService,
  ) {
    this.logger.setContext(S3StorageService.name);
    this.build({
      region: config.get<string>('S3_REGION'),
      bucketDocuments: config.get<string>('S3_BUCKET_DOCUMENTS'),
      bucketMedia: config.get<string>('S3_BUCKET_MEDIA'),
      accessKeyId: config.get<string>('S3_ACCESS_KEY_ID'),
      secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY'),
    });
    this.fingerprint = 'env';
  }

  private build(f: Record<string, string | undefined>): void {
    const documents = f.bucketDocuments;
    const media = f.bucketMedia;
    this.client?.destroy();
    this.client = undefined;
    this.buckets = undefined;
    if (!documents || !media) return;
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    this.buckets = { documents, media };
    this.client = new S3Client({
      region: f.region ?? 'us-east-1',
      endpoint,
      // MinIO serves buckets by path, not by virtual-host subdomain.
      forcePathStyle: endpoint !== undefined,
      credentials:
        f.accessKeyId && f.secretAccessKey
          ? { accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey }
          : undefined,
    });
  }

  /**
   * Owner 2026-10-01: the storage keys can be changed in Admin →
   * Integrations; the client is rebuilt only when they changed.
   */
  private async refresh(): Promise<void> {
    const c = await this.secrets?.get('storage');
    if (c?.source === 'db') {
      if (c.fingerprint !== this.fingerprint) {
        this.build(c.fields);
        this.fingerprint = c.fingerprint;
      }
    } else if (this.fingerprint !== 'env') {
      this.build({
        region: this.config.get<string>('S3_REGION'),
        bucketDocuments: this.config.get<string>('S3_BUCKET_DOCUMENTS'),
        bucketMedia: this.config.get<string>('S3_BUCKET_MEDIA'),
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY'),
      });
      this.fingerprint = 'env';
    }
  }

  get configured(): boolean {
    return this.client !== undefined;
  }

  bucket(kind: BucketKind): string {
    return this.require().buckets[kind];
  }

  /** Browser-style POST policy: the object can only be written at [key],
   * with exactly [size] bytes and exactly [contentType] — S3 rejects any
   * other upload before it is stored. */
  async presignPost(input: {
    bucket: string;
    key: string;
    contentType: string;
    size: number;
    expiresSec: number;
  }): Promise<PresignedPost> {
    await this.refresh();
    const { client } = this.require();
    const { url, fields } = await createPresignedPost(client, {
      Bucket: input.bucket,
      Key: input.key,
      Conditions: [
        ['content-length-range', input.size, input.size],
        ['eq', '$Content-Type', input.contentType],
      ],
      Fields: { 'Content-Type': input.contentType },
      Expires: input.expiresSec,
    });
    return { url, fields };
  }

  async head(bucket: string, key: string): Promise<ObjectHead | null> {
    await this.refresh();
    const { client } = this.require();
    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        size: Number(res.ContentLength ?? 0),
        contentType: res.ContentType,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async read(bucket: string, key: string): Promise<Buffer> {
    await this.refresh();
    const { client } = this.require();
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) return Buffer.alloc(0);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async put(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.refresh();
    const { client } = this.require();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Deletes objects; a missing key is not an error (idempotent). */
  async remove(bucket: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.refresh();
    const { client } = this.require();
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  /** Short-lived signed GET link. */
  async signedGetUrl(
    bucket: string,
    key: string,
    expiresSec: number,
  ): Promise<string> {
    await this.refresh();
    const { client } = this.require();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: Math.max(1, Math.floor(expiresSec)) },
    );
  }

  /** Dev/test only (FilesBootstrap): creates missing buckets, private. */
  async ensureBuckets(): Promise<string[]> {
    await this.refresh();
    const { client, buckets } = this.require();
    const created: string[] = [];
    for (const name of new Set(Object.values(buckets))) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: name }));
      } catch (err) {
        if (!isNotFound(err)) throw err;
        await client.send(new CreateBucketCommand({ Bucket: name }));
        created.push(name);
      }
    }
    return created;
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }

  private require(): { client: S3Client; buckets: Record<BucketKind, string> } {
    if (!this.client || !this.buckets) {
      throw new ServiceUnavailableException({
        code: ErrorCode.FILE_STORAGE_UNAVAILABLE,
        message: 'File storage is not configured.',
      });
    }
    return { client: this.client, buckets: this.buckets };
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.name === 'NoSuchBucket' ||
    e?.$metadata?.httpStatusCode === 404
  );
}
