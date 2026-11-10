import { ConfigService } from '@nestjs/config';
import { CopyObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

/**
 * Security audit 2026-11-08 (L5): before confirm the object a presigned
 * link wrote already answers at its public R2 URL. It was written with the
 * immutable one-year Cache-Control, so one fetch kept it at the edge long
 * after the sweep deleted it. Uploads are now `no-store`; confirm's copy
 * (M3) is the object that gets the bucket's real headers.
 */
const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

function service(): S3StorageService {
  return new S3StorageService(
    new ConfigService({
      S3_REGION: 'us-east-1',
      S3_BUCKET_DOCUMENTS: 'lawbid-documents',
      S3_BUCKET_MEDIA: 'lawbid-media',
      S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
      S3_SECRET_ACCESS_KEY: 'secret-secret-secret-secret',
    }),
    logger as never,
  );
}

describe('S3StorageService upload staging (audit L5)', () => {
  it('a presigned upload of public media is written no-store', async () => {
    const post = await service().presignPost({
      bucket: 'lawbid-media',
      key: 'post_image/s0/2026/11/f1',
      contentType: 'image/jpeg',
      size: 10,
      expiresSec: 60,
    });
    expect(post.fields['Cache-Control']).toBe('private, no-store');
  });

  it('confirm’s copy replaces the headers with the real ones', async () => {
    const s = service();
    const send = jest.fn().mockResolvedValue({});
    (s as unknown as { client: { send: jest.Mock } }).client = { send };
    const s3 = s as unknown as {
      buckets?: unknown;
      refresh: () => Promise<void>;
    };
    await s3.refresh();
    (s as unknown as { require: () => unknown }).require = () => ({
      client: { send },
      buckets: { documents: 'lawbid-documents', media: 'lawbid-media' },
    });
    await s.copy('lawbid-media', 'a/f1', 'a/f1_sx', {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const cmd = send.mock.calls[0][0] as CopyObjectCommand;
    expect(cmd.input).toMatchObject({
      MetadataDirective: 'REPLACE',
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });
});
