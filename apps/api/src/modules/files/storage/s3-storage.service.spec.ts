import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import type Redis from 'ioredis';
import {
  IMMUTABLE_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
  S3StorageService,
  signCloudFrontUrl,
} from './s3-storage.service';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const logger = { setContext: jest.fn(), warn: jest.fn() };

function service(env: Record<string, string | undefined>): S3StorageService {
  return new S3StorageService(
    new ConfigService({
      S3_REGION: 'us-east-1',
      S3_BUCKET_DOCUMENTS: 'lawbid-documents',
      S3_BUCKET_MEDIA: 'lawbid-media',
      S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
      S3_SECRET_ACCESS_KEY: 'secret-secret-secret-secret',
      ...env,
    }),
    logger as never,
  );
}

describe('signCloudFrontUrl', () => {
  const cdn = {
    domain: 'd1.cloudfront.net',
    keyPairId: 'K2JCJMDEHXQW5F',
    privateKey: PEM,
  };

  it('signs the full URL with the private cache header and the download name', () => {
    const url = new URL(
      signCloudFrontUrl(
        cdn,
        'chat_attachment/u1/f1',
        60,
        'Договор №1.pdf',
        1_700_000_000_000,
      ),
    );
    expect(url.host).toBe('d1.cloudfront.net');
    expect(url.pathname).toBe('/chat_attachment/u1/f1');
    expect(url.searchParams.get('response-cache-control')).toBe(
      PRIVATE_CACHE_CONTROL,
    );
    expect(url.searchParams.get('response-content-disposition')).toContain(
      "filename*=UTF-8''%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80",
    );
    expect(url.searchParams.get('Key-Pair-Id')).toBe('K2JCJMDEHXQW5F');
    expect(url.searchParams.get('Expires')).toBe(String(1_700_000_000 + 60));
    expect(url.searchParams.get('Signature')).toMatch(/^[A-Za-z0-9~_-]+$/);
    expect(url.searchParams.has('X-Amz-Signature')).toBe(false);
  });

  it('percent-encodes key segments', () => {
    const url = new URL(signCloudFrontUrl(cdn, 'a b/c#d', 5));
    expect(url.pathname).toBe('/a%20b/c%23d');
  });
});

describe('S3StorageService.signedGetUrl', () => {
  it('uses CloudFront for the documents bucket only when the three values are set', async () => {
    const s = service({
      CLOUDFRONT_PRIVATE_DOMAIN: 'd1.cloudfront.net',
      CLOUDFRONT_PRIVATE_KEY_ID: 'K2JCJMDEHXQW5F',
      CLOUDFRONT_PRIVATE_KEY_PEM: PEM,
    });
    expect(s.privateCdnEnabled).toBe(true);
    const doc = await s.signedGetUrl(
      'lawbid-documents',
      'case_photo/u1/f1',
      300,
    );
    expect(doc.startsWith('https://d1.cloudfront.net/case_photo/u1/f1?')).toBe(
      true,
    );
    expect(doc).toContain('Signature=');
    // The media bucket keeps the presigned S3 GET (its public CDN is separate).
    const media = await s.signedGetUrl('lawbid-media', 'avatar/u1/f1', 300);
    expect(media).toContain('X-Amz-Signature=');
    expect(media).toContain('lawbid-media');
  });

  it('falls back to presigned S3 links without the key (and warns on a partial set)', async () => {
    const s = service({ CLOUDFRONT_PRIVATE_DOMAIN: 'd1.cloudfront.net' });
    expect(s.privateCdnEnabled).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    const doc = await s.signedGetUrl(
      'lawbid-documents',
      'case_photo/u1/f1',
      300,
    );
    expect(doc).toContain('X-Amz-Signature=');
    expect(doc).toContain('response-cache-control=');
  });

  it('accepts a PEM pasted with literal \\n', () => {
    const s = service({
      CLOUDFRONT_PRIVATE_DOMAIN: 'd1.cloudfront.net',
      CLOUDFRONT_PRIVATE_KEY_ID: 'K2JCJMDEHXQW5F',
      CLOUDFRONT_PRIVATE_KEY_PEM: PEM.replace(/\n/g, '\\n'),
    });
    expect(s.privateCdnEnabled).toBe(true);
  });
});

describe('S3StorageService cache headers and CDN invalidation', () => {
  it('documents are private, public media stays immutable', () => {
    const s = service({});
    expect(s.cacheControlFor('lawbid-documents')).toBe(PRIVATE_CACHE_CONTROL);
    expect(s.cacheControlFor('lawbid-media')).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(PRIVATE_CACHE_CONTROL).toMatch(/^private,/);
  });

  it('presigned S3 reads of private files ask for a private header', async () => {
    const s = service({});
    const doc = await s.signedGetUrl(
      'lawbid-documents',
      'case_photo/u1/f1',
      60,
    );
    expect(decodeURIComponent(doc)).toContain(
      `response-cache-control=${PRIVATE_CACHE_CONTROL}`,
    );
    const media = await s.signedGetUrl('lawbid-media', 'avatar/u1/f1', 60);
    expect(decodeURIComponent(media)).toContain(
      `response-cache-control=${IMMUTABLE_CACHE_CONTROL}`,
    );
  });

  function removing(env: Record<string, string | undefined>) {
    const added: string[][] = [];
    const redis = {
      sadd: jest.fn((_k: string, ...m: string[]) => {
        added.push(m);
        return Promise.resolve(m.length);
      }),
      expire: jest.fn(() => Promise.resolve(1)),
    } as unknown as Redis;
    const s = new S3StorageService(
      new ConfigService({
        S3_REGION: 'us-east-1',
        S3_BUCKET_DOCUMENTS: 'lawbid-documents',
        S3_BUCKET_MEDIA: 'lawbid-media',
        S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
        S3_SECRET_ACCESS_KEY: 'secret-secret-secret-secret',
        ...env,
      }),
      logger as never,
      undefined,
      undefined,
      redis,
    );
    const send = jest.fn().mockResolvedValue({});
    (s as unknown as { client: { send: jest.Mock } }).client = { send };
    return { s, added, send };
  }

  it('queues one wildcard path per file for the media CDN', async () => {
    const { s, added, send } = removing({
      CLOUDFRONT_MEDIA_DISTRIBUTION_ID: 'EMEDIA12345',
    });
    await s.remove(
      'lawbid-media',
      ['avatar/u1/f1', 'avatar/u1/f1_w256', 'avatar/u1/f1.avif'],
      { invalidateKeys: ['avatar/u1/f1'] },
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(added).toEqual([['/avatar/u1/f1*']]);
  });

  it('queues nothing without the opt-in, the id, or for private files without a CDN', async () => {
    const a = removing({ CLOUDFRONT_MEDIA_DISTRIBUTION_ID: 'EMEDIA12345' });
    await a.s.remove('lawbid-media', ['avatar/u1/f1']);
    expect(a.added).toEqual([]);
    const b = removing({});
    await b.s.remove('lawbid-media', ['avatar/u1/f1'], {
      invalidateKeys: ['avatar/u1/f1'],
    });
    expect(b.added).toEqual([]);
    const c = removing({ CLOUDFRONT_PRIVATE_DISTRIBUTION_ID: 'EDOCS123456' });
    await c.s.remove('lawbid-documents', ['case_photo/u1/f1'], {
      invalidateKeys: ['case_photo/u1/f1'],
    });
    expect(c.added).toEqual([]);
  });

  it('queues private files through the documents distribution', async () => {
    const { s, added } = removing({
      CLOUDFRONT_PRIVATE_DISTRIBUTION_ID: 'EDOCS123456',
      CLOUDFRONT_PRIVATE_DOMAIN: 'd1.cloudfront.net',
      CLOUDFRONT_PRIVATE_KEY_ID: 'K2JCJMDEHXQW5F',
      CLOUDFRONT_PRIVATE_KEY_PEM: PEM,
    });
    await s.remove('lawbid-documents', ['case_photo/u1/f1'], {
      invalidateKeys: ['case_photo/u1/f1'],
    });
    expect(added).toEqual([['/case_photo/u1/f1*']]);
  });
});
