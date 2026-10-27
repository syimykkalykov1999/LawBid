import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** The web bucket the static pages live in (same bucket as the app). */
export interface SeoWebStore {
  /** Text of an object, or null when it does not exist. */
  getText: (key: string) => Promise<string | null>;
  put: (
    key: string,
    body: string,
    contentType: string,
    cacheControl: string,
  ) => Promise<void>;
  /** At most 1000 keys. */
  deleteMany: (keys: string[]) => Promise<void>;
}

/** DI token: tests replace the bucket. */
export const SEO_WEB_STORE = Symbol('SEO_WEB_STORE');

function isMissing(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NoSuchKey' ||
    e?.name === 'NotFound' ||
    e?.$metadata?.httpStatusCode === 404
  );
}

/** Real bucket; credentials come from the default AWS chain (the task role). */
export function createSeoWebStore(opts: {
  bucket: string;
  region?: string;
}): SeoWebStore {
  const client = new S3Client({ region: opts.region ?? 'us-east-1' });
  return {
    async getText(key) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: opts.bucket, Key: key }),
        );
        return (await res.Body?.transformToString('utf8')) ?? null;
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async put(key, body, contentType, cacheControl) {
      await client.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
    },
    async deleteMany(keys) {
      if (keys.length === 0) return;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: opts.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    },
  };
}
