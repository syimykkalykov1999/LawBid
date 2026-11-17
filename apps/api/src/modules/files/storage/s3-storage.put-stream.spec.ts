import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import {
  IMMUTABLE_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
  S3StorageService,
} from './s3-storage.service';

/**
 * Media check 14.11 (rows 97/144), measured on MinIO: `putStream` wrote
 * `public, max-age=31536000, immutable` on the documents bucket (the
 * personal-data export ZIP, the legal export) — every other write there is
 * `private, max-age=3600` (S2-10). A read path that does not override the
 * header would let a shared cache keep a person's export for a year.
 */
const params: Array<Record<string, unknown>> = [];
jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    private readonly body: AsyncIterable<unknown>;
    constructor(opts: { params: Record<string, unknown> }) {
      params.push(opts.params);
      this.body = opts.params.Body as AsyncIterable<unknown>;
    }
    // The body is drained so the byte count and hash are computed.
    async done(): Promise<void> {
      for await (const chunk of this.body) void chunk;
    }
    async abort(): Promise<void> {}
  },
}));

function service(): S3StorageService {
  return new S3StorageService(
    new ConfigService({
      S3_REGION: 'us-east-1',
      S3_BUCKET_DOCUMENTS: 'lawbid-documents',
      S3_BUCKET_MEDIA: 'lawbid-media',
      S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
      S3_SECRET_ACCESS_KEY: 'secret-secret-secret-secret',
    }),
    { setContext: jest.fn(), warn: jest.fn(), info: jest.fn() } as never,
  );
}

describe('S3StorageService.putStream Cache-Control', () => {
  beforeEach(() => (params.length = 0));

  it('a documents-bucket stream is private, never public-immutable', async () => {
    const out = await service().putStream(
      'lawbid-documents',
      'exports/u1.zip',
      Readable.from([Buffer.from('zip')]),
      'application/zip',
    );
    expect(out.bytes).toBe(3);
    expect(params[0].CacheControl).toBe(PRIVATE_CACHE_CONTROL);
  });

  it('a public-media stream keeps the immutable year', async () => {
    await service().putStream(
      'lawbid-media',
      'post/a.bin',
      Readable.from([Buffer.from('x')]),
      'application/octet-stream',
    );
    expect(params[0].CacheControl).toBe(IMMUTABLE_CACHE_CONTROL);
  });
});
