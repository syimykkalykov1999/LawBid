import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import {
  IMMUTABLE_CACHE_CONTROL,
  S3StorageService,
} from './s3-storage.service';

// Owner 2026-10-24: public media on Cloudflare R2
// (docs/architecture/R2_PUBLIC_MEDIA.md). Private content never reaches R2.

const logger = { setContext: jest.fn(), warn: jest.fn() };

const R2 = {
  accountId: 'a'.repeat(32),
  accessKeyId: 'r2accesskeyid0000000000',
  secretAccessKey: 'r2secretaccesskey000000000000000000',
  bucket: 'lawbid-public-r2',
  publicBaseUrl: 'https://media.lawbid.dev/',
};

function r2service(
  mode: 'aws' | 'r2',
  fields: Record<string, string | undefined> = R2,
): S3StorageService {
  const secrets = {
    get: jest.fn((provider: string) =>
      Promise.resolve(
        provider === 'cloudflare_r2'
          ? { source: 'db', fingerprint: 'fp1', fields }
          : null,
      ),
    ),
  };
  const settings = { string: jest.fn().mockResolvedValue(mode) };
  return new S3StorageService(
    new ConfigService({
      S3_REGION: 'us-east-1',
      S3_BUCKET_DOCUMENTS: 'lawbid-documents',
      S3_BUCKET_MEDIA: 'lawbid-media',
      S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
      S3_SECRET_ACCESS_KEY: 'secret-secret-secret-secret',
    }),
    logger as never,
    secrets as never,
    settings as never,
  );
}

/** Records which endpoint (R2 = region "auto") each S3 command went to. */
function spySend() {
  const calls: { cmd: string; region: string }[] = [];
  jest.spyOn(S3Client.prototype, 'send').mockImplementation(async function (
    this: S3Client,
    cmd: unknown,
  ) {
    calls.push({
      cmd: (cmd as object).constructor.name,
      region: await this.config.region(),
    });
    return {};
  } as never);
  return calls;
}

/** The public domain and the web app answer like a finished setup. */
function healthyWeb(): jest.SpyInstance {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(null, { status: 404 }));
}

describe('S3StorageService with Cloudflare R2', () => {
  beforeEach(() => {
    healthyWeb();
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('switch off: public media is the AWS media bucket, nothing changes', async () => {
    const s = r2service('aws');
    expect(await s.resolveBucket('media')).toBe('lawbid-media');
    expect(await s.resolveBucket('documents')).toBe('lawbid-documents');
    expect(s.publicStoreActive).toBe(false);
  });

  it('switch on: public media is R2, private documents are still AWS', async () => {
    const s = r2service('r2');
    expect(await s.resolveBucket('media')).toBe('lawbid-public-r2');
    expect(await s.resolveBucket('documents')).toBe('lawbid-documents');
    expect(s.isPublicStoreBucket('lawbid-documents')).toBe(false);
  });

  it('a private kind can never resolve to R2, whatever is configured', async () => {
    for (const mode of ['aws', 'r2'] as const) {
      const s = r2service(mode);
      await s.ready();
      expect(s.bucket('documents')).toBe('lawbid-documents');
      expect(s.isPublicStoreBucket(s.bucket('documents'))).toBe(false);
    }
    // Even an R2 bucket named like the documents bucket is refused.
    const clash = r2service('r2', { ...R2, bucket: 'lawbid-documents' });
    expect(await clash.resolveBucket('documents')).toBe('lawbid-documents');
    expect(await clash.resolveBucket('media')).toBe('lawbid-media');
    expect(clash.isPublicStoreBucket('lawbid-documents')).toBe(false);
  });

  it('R2 with a missing field is ignored (the switch cannot break uploads)', async () => {
    const s = r2service('r2', { ...R2, publicBaseUrl: undefined });
    expect(await s.resolveBucket('media')).toBe('lawbid-media');
  });

  it('routes every operation by bucket name: R2 objects to R2, AWS objects to AWS', async () => {
    const s = r2service('r2');
    const calls = spySend();
    await s.head('lawbid-public-r2', 'avatar/u/f');
    await s.head('lawbid-media', 'avatar/u/g');
    await s.put(
      'lawbid-public-r2',
      'avatar/u/f_w256',
      Buffer.from('x'),
      'image/webp',
    );
    await s.read('lawbid-documents', 'case_photo/u/h');
    await s.remove('lawbid-public-r2', ['avatar/u/f']);
    await s.remove('lawbid-documents', ['case_photo/u/h']);
    expect(calls.map((c) => [c.cmd, c.region])).toEqual([
      ['HeadObjectCommand', 'auto'],
      ['HeadObjectCommand', 'us-east-1'],
      ['PutObjectCommand', 'auto'],
      ['GetObjectCommand', 'us-east-1'],
      ['DeleteObjectsCommand', 'auto'],
      ['DeleteObjectsCommand', 'us-east-1'],
    ]);
  });

  it('after a rollback to aws, objects already in R2 stay readable', async () => {
    const s = r2service('aws');
    const calls = spySend();
    await s.read('lawbid-public-r2', 'avatar/u/f');
    expect(calls[0].region).toBe('auto');
    expect(s.bucket('media')).toBe('lawbid-media');
  });

  it('presigns a PUT that signs type, size and cache headers, only for R2', async () => {
    const s = r2service('r2');
    const put = await s.presignPut({
      bucket: 'lawbid-public-r2',
      key: 'post_image/u1/f1',
      contentType: 'image/jpeg',
      size: 1234,
      expiresSec: 300,
    });
    const url = new URL(put.url);
    expect(url.host).toBe(
      `lawbid-public-r2.${R2.accountId}.r2.cloudflarestorage.com`,
    );
    expect(url.pathname).toBe('/post_image/u1/f1');
    const signed = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(
      ';',
    );
    expect(signed).toEqual(
      expect.arrayContaining([
        'content-type',
        'content-length',
        'cache-control',
      ]),
    );
    expect(put.method).toBe('PUT');
    expect(put.fields).toEqual({});
    expect(put.headers).toEqual({
      'Content-Type': 'image/jpeg',
      'Cache-Control': IMMUTABLE_CACHE_CONTROL,
    });
    await expect(
      s.presignPut({
        bucket: 'lawbid-documents',
        key: 'case_photo/u1/f1',
        contentType: 'image/jpeg',
        size: 1,
        expiresSec: 300,
      }),
    ).rejects.toThrow('only for the public R2 bucket');
  });

  it('serves R2 objects from the public domain, never a signed AWS link', async () => {
    const s = r2service('r2');
    expect(
      await s.signedGetUrl('lawbid-public-r2', 'avatar/u 1/f1_w256', 60),
    ).toBe('https://media.lawbid.dev/avatar/u%201/f1_w256');
    expect(s.publicObjectUrl('lawbid-documents', 'k')).toBeNull();
    expect(s.publicObjectUrl('lawbid-media', 'k')).toBeNull();
  });

  it('purges the edge copy after an R2 delete when a zone and token are set', async () => {
    const s = r2service('r2', {
      ...R2,
      zoneId: 'b'.repeat(32),
      purgeToken: 'tok'.repeat(12),
    });
    spySend();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    await s.remove('lawbid-public-r2', ['avatar/u1/f1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url as string).toContain(`/zones/${'b'.repeat(32)}/purge_cache`);
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      files: ['https://media.lawbid.dev/avatar/u1/f1'],
    });
    // An AWS delete never calls Cloudflare.
    await s.remove('lawbid-media', ['avatar/u1/f2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed purge is only logged, the delete still succeeds', async () => {
    const s = r2service('r2', {
      ...R2,
      zoneId: 'b'.repeat(32),
      purgeToken: 'tok'.repeat(12),
    });
    spySend();
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(
      s.remove('lawbid-public-r2', ['avatar/u1/f1']),
    ).resolves.toBeUndefined();
  });

  describe('the switch on while R2 is not ready (owner 2026-11-04)', () => {
    const on = () => r2service('r2');

    it('keys refused or no bucket: new media stays on AWS and the admin is told', async () => {
      jest
        .spyOn(S3Client.prototype, 'send')
        .mockRejectedValue(new Error('403') as never);
      const s = on();
      expect(await s.resolveBucket('media')).toBe('lawbid-media');
      expect(s.publicStoreActive).toBe(false);
      const st = await s.r2Status();
      expect(st).toMatchObject({ selected: true, active: false });
      expect(st.fallback).toContain('не принял ключи');
    });

    it.each([
      ['the domain does not resolve', () => Promise.reject(new Error('DNS'))],
      [
        'the domain answers 5xx',
        () => Promise.resolve(new Response(null, { status: 522 })),
      ],
    ])('%s: AWS', async (_name, answer) => {
      jest.spyOn(global, 'fetch').mockImplementation(answer);
      const s = on();
      expect(await s.resolveBucket('media')).toBe('lawbid-media');
      expect((await s.r2Status()).fallback).toContain('Публичный адрес');
    });

    it('the web app CSP does not allow R2 yet: AWS, and says terraform', async () => {
      jest.spyOn(global, 'fetch').mockImplementation(((url: string) =>
        Promise.resolve(
          url === 'https://lawbid.dev'
            ? new Response(null, {
                headers: { 'content-security-policy': "connect-src 'self'" },
              })
            : new Response(null, { status: 404 }),
        )) as never);
      const s = r2service('r2', {
        ...R2,
        publicBaseUrl: 'https://media.lawbid.dev',
      });
      expect(await s.resolveBucket('media')).toBe('lawbid-media');
      expect((await s.r2Status()).fallback).toContain('terraform');
    });

    it('the web app allowing R2, or not answering, does not hold it back', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockImplementation(((url: string) =>
          url === 'https://lawbid.dev'
            ? Promise.reject(new Error('down'))
            : Promise.resolve(new Response(null, { status: 404 }))) as never);
      const s = r2service('r2', {
        ...R2,
        publicBaseUrl: 'https://media.lawbid.dev',
      });
      expect(await s.resolveBucket('media')).toBe('lawbid-public-r2');
    });

    it('recovers by itself once R2 answers, without a restart', async () => {
      const send = jest
        .spyOn(S3Client.prototype, 'send')
        .mockRejectedValue(new Error('403') as never);
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      const s = on();
      expect(await s.resolveBucket('media')).toBe('lawbid-media');
      send.mockResolvedValue({} as never);
      now.mockReturnValue(1_000_000 + 31_000);
      expect(await s.resolveBucket('media')).toBe('lawbid-public-r2');
      expect((await s.r2Status()).fallback).toBeNull();
    });

    it('looks at most once a minute while healthy', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send');
      const s = on();
      await Promise.all([s.resolveBucket('media'), s.resolveBucket('media')]);
      await s.resolveBucket('media');
      const heads = send.mock.calls.filter(
        ([c]) => c.constructor.name === 'HeadBucketCommand',
      );
      expect(heads).toHaveLength(1);
    });

    it('a private kind never triggers a look and never reaches R2', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send');
      const s = on();
      expect(await s.resolveBucket('documents')).toBe('lawbid-documents');
      expect(send).not.toHaveBeenCalled();
    });

    it('the switch off: no look, no red line', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send');
      const s = r2service('aws');
      await s.resolveBucket('media');
      expect(await s.r2Status()).toEqual({
        selected: false,
        active: false,
        fallback: null,
      });
      expect(send).not.toHaveBeenCalled();
    });

    it('no keys at all: AWS and a red line naming the integration', async () => {
      const s = r2service('r2', { ...R2, bucket: undefined });
      expect(await s.resolveBucket('media')).toBe('lawbid-media');
      expect((await s.r2Status()).fallback).toContain('Cloudflare R2');
    });
  });
});

/** C-c11 (2026-11-09): a put with a lock carries the Object Lock headers
 * (COMPLIANCE + retain-until); without one it carries none, so a bucket
 * without Object Lock (local MinIO, R2) never sees them. */
describe('S3StorageService.put with Object Lock (C-c11)', () => {
  const inputs = () => {
    const seen: Record<string, unknown>[] = [];
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(((
      cmd: unknown,
    ) => {
      seen.push((cmd as { input: Record<string, unknown> }).input);
      return Promise.resolve({});
    }) as never);
    return seen;
  };

  it('sends ObjectLockMode COMPLIANCE and the retain-until date', async () => {
    const s = r2service('aws');
    const seen = inputs();
    const until = new Date('2033-11-09T00:00:00Z');
    await s.put(
      'lawbid-documents',
      'case_attachment/s0/2026/11/f',
      Buffer.from('x'),
      'application/pdf',
      { retainUntil: until },
    );
    expect(seen[0]).toMatchObject({
      Bucket: 'lawbid-documents',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: until,
    });
  });

  it('a put without a lock carries no Object Lock fields', async () => {
    const s = r2service('aws');
    const seen = inputs();
    await s.put('lawbid-documents', 'k', Buffer.from('x'), 'application/pdf');
    expect(seen[0]).not.toHaveProperty('ObjectLockMode');
    expect(seen[0]).not.toHaveProperty('ObjectLockRetainUntilDate');
  });
});
