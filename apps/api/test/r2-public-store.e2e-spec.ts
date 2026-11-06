import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3StorageService } from '../src/modules/files/storage/s3-storage.service';

/**
 * Owner 2026-11-04 (R-407): the real S3 protocol of the public R2 path against
 * MinIO, a second S3 standing in for Cloudflare (`R2_TEST_ENDPOINT`). What it
 * proves: the signature of a presigned PUT really covers the headers we sign,
 * parts assemble, every operation lands in the bucket of the row. What it
 * cannot prove (real R2 only, Admin → «Проверить»): R2's own rules, the custom
 * domain, CORS, the cache.
 */
jest.setTimeout(60_000);

const endpoint = process.env.S3_ENDPOINT;
const KEYS = {
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'lawbid',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'lawbid_dev_only',
};
// Per isolation tag, like the AWS buckets of test/support/e2e-setup-env.ts.
const R2_BUCKET = `lawbid-e2e-${process.env.E2E_ISOLATION || 'default'}-r2`;
const BASE = 'https://media.e2e.invalid';
const IMAGE = Buffer.from('fake image bytes');

// MinIO needs this suite's bucket; without MinIO there is nothing to test.
(endpoint ? describe : describe.skip)('R2 public store on MinIO', () => {
  let admin: S3Client;
  let storage: S3StorageService;
  const realFetch = global.fetch;
  const savedEndpoint = process.env.R2_TEST_ENDPOINT;

  function service(mode: 'aws' | 'r2', bucket = R2_BUCKET): S3StorageService {
    const fields = {
      accountId: 'a'.repeat(32),
      ...KEYS,
      bucket,
      publicBaseUrl: BASE,
    };
    return new S3StorageService(
      new ConfigService({
        S3_REGION: 'us-east-1',
        S3_ENDPOINT: endpoint,
        S3_BUCKET_DOCUMENTS:
          process.env.S3_BUCKET_DOCUMENTS ?? 'lawbid-documents',
        S3_BUCKET_MEDIA: process.env.S3_BUCKET_MEDIA ?? 'lawbid-media',
        S3_ACCESS_KEY_ID: KEYS.accessKeyId,
        S3_SECRET_ACCESS_KEY: KEYS.secretAccessKey,
      }),
      { setContext: jest.fn(), warn: jest.fn(), info: jest.fn() } as never,
      {
        get: (p: string) =>
          Promise.resolve(
            p === 'cloudflare_r2'
              ? { source: 'db', fingerprint: `fp-${bucket}`, fields }
              : null,
          ),
      } as never,
      { string: () => Promise.resolve(mode) } as never,
    );
  }

  beforeAll(async () => {
    process.env.R2_TEST_ENDPOINT = endpoint;
    // The public domain and the site do not exist here: answer for them.
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(((url: string, init?: RequestInit) =>
        String(url).includes('e2e.invalid')
          ? Promise.resolve(new Response(null, { status: 404 }))
          : realFetch(url, init)) as never);
    admin = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: KEYS,
    });
    await admin
      .send(new HeadBucketCommand({ Bucket: R2_BUCKET }))
      .catch(() => admin.send(new CreateBucketCommand({ Bucket: R2_BUCKET })));
    storage = service('r2');
    expect(await storage.resolveBucket('media')).toBe(R2_BUCKET);
  });

  afterAll(() => {
    jest.restoreAllMocks();
    if (savedEndpoint === undefined) delete process.env.R2_TEST_ENDPOINT;
    else process.env.R2_TEST_ENDPOINT = savedEndpoint;
    admin.destroy();
    storage.onModuleDestroy();
  });

  const presign = (key: string, size = IMAGE.length) =>
    storage.presignPut({
      bucket: R2_BUCKET,
      key,
      contentType: 'image/jpeg',
      size,
      expiresSec: 60,
    });

  it('a presigned PUT with the returned headers stores the object, with its cache header', async () => {
    const key = 'avatar/e2e/put-ok';
    const t = await presign(key);
    expect(t.method).toBe('PUT');
    expect(t.fields).toEqual({});
    const res = await realFetch(t.url, {
      method: 'PUT',
      headers: t.headers,
      body: IMAGE,
    });
    expect(res.status).toBe(200);
    expect(await storage.head(R2_BUCKET, key)).toMatchObject({
      size: IMAGE.length,
      contentType: 'image/jpeg',
    });
    expect((await storage.read(R2_BUCKET, key)).equals(IMAGE)).toBe(true);
    await storage.remove(R2_BUCKET, [key]);
    expect(await storage.head(R2_BUCKET, key)).toBeNull();
  });

  it.each([
    ['another Content-Type', { 'Content-Type': 'text/html' }],
    ['another Cache-Control', { 'Cache-Control': 'no-store' }],
  ])('%s is refused by the signature', async (_name, change) => {
    const key = 'avatar/e2e/put-bad';
    const t = await presign(key);
    const res = await realFetch(t.url, {
      method: 'PUT',
      headers: { ...t.headers, ...change },
      body: IMAGE,
    });
    expect(res.status).toBe(403);
    expect(await storage.head(R2_BUCKET, key)).toBeNull();
  });

  it('a body of another length than declared is refused', async () => {
    const key = 'avatar/e2e/put-long';
    const t = await presign(key, IMAGE.length - 1);
    const res = await realFetch(t.url, {
      method: 'PUT',
      headers: t.headers,
      body: IMAGE,
    });
    expect(res.status).toBe(403);
    expect(await storage.head(R2_BUCKET, key)).toBeNull();
  });

  it('multipart: parts are stored, listed and assembled in the R2 bucket', async () => {
    const key = 'post_image/e2e/multipart';
    const uploadId = await storage.startMultipart({
      bucket: R2_BUCKET,
      key,
      contentType: 'image/jpeg',
    });
    const first = Buffer.alloc(5 * 1024 * 1024, 1);
    const second = Buffer.from('tail');
    for (const [partNumber, body] of [first, second].entries()) {
      const url = await storage.presignPart({
        bucket: R2_BUCKET,
        key,
        uploadId,
        partNumber: partNumber + 1,
        expiresSec: 60,
      });
      const res = await realFetch(url, { method: 'PUT', body });
      expect(res.status).toBe(200);
    }
    const parts = await storage.listParts(R2_BUCKET, key, uploadId);
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2]);
    await storage.completeMultipart(R2_BUCKET, key, uploadId, parts);
    expect((await storage.head(R2_BUCKET, key))?.size).toBe(
      first.length + second.length,
    );
    await storage.remove(R2_BUCKET, [key]);
  });

  it('server-side put (variants, starter stickers) and the public link', async () => {
    const key = 'sticker/e2e/put_w256';
    await storage.put(R2_BUCKET, key, IMAGE, 'image/webp');
    expect((await storage.head(R2_BUCKET, key))?.contentType).toBe(
      'image/webp',
    );
    expect(storage.publicObjectUrl(R2_BUCKET, key)).toBe(`${BASE}/${key}`);
    expect(await storage.signedGetUrl(R2_BUCKET, key, 60)).toBe(
      `${BASE}/${key}`,
    );
    await storage.remove(R2_BUCKET, [key]);
  });

  it('a private kind stays on the AWS bucket with a POST, whatever the switch says', async () => {
    const documents = await storage.resolveBucket('documents');
    expect(documents).not.toBe(R2_BUCKET);
    expect(storage.isPublicStoreBucket(documents)).toBe(false);
    await expect(
      storage.presignPut({
        bucket: documents,
        key: 'x',
        contentType: 'image/jpeg',
        size: 1,
        expiresSec: 60,
      }),
    ).rejects.toThrow('only for the public R2 bucket');
  });

  it('a bucket that does not exist: the switch on still means AWS', async () => {
    const missing = `${R2_BUCKET}-missing`;
    const broken = service('r2', missing);
    const media = await broken.resolveBucket('media');
    expect(media).not.toBe(missing);
    expect((await broken.r2Status()).fallback).toContain('не принял ключи');
    broken.onModuleDestroy();
  });
});
