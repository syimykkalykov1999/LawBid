import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { S3StorageService } from '../../modules/files/storage/s3-storage.service';
import {
  CountingHash,
  ExportLimitError,
  createZipExport,
  jsonArrayStream,
  jsonObjectStream,
  pagedById,
  pagedBySkip,
} from './export-stream';

jest.setTimeout(180_000);

/** An S3 client double that records multipart traffic and drops the bytes. */
class FakeS3 {
  config = {};
  middlewareStack = { add: () => undefined, remove: () => undefined };
  bytes = 0;
  parts = 0;
  completed = false;
  aborted = false;
  maxPart = 0;
  async send(cmd: { constructor: { name: string }; input: any }) {
    switch (cmd.constructor.name) {
      case 'CreateMultipartUploadCommand':
        return { UploadId: 'u1' };
      case 'UploadPartCommand': {
        const b = cmd.input.Body as Buffer | Uint8Array;
        this.bytes += b.length;
        this.maxPart = Math.max(this.maxPart, b.length);
        this.parts += 1;
        return { ETag: `"p${this.parts}"` };
      }
      case 'PutObjectCommand': {
        const b = cmd.input.Body as Buffer | string;
        this.bytes += b.length;
        return { ETag: '"one"' };
      }
      case 'CompleteMultipartUploadCommand':
        this.completed = true;
        return { Location: 'x', Bucket: 'b', Key: 'k' };
      case 'AbortMultipartUploadCommand':
        this.aborted = true;
        return {};
      default:
        return {};
    }
  }
}

function storageWith(fake: FakeS3): S3StorageService {
  const svc = new S3StorageService(
    new ConfigService({
      S3_REGION: 'us-east-1',
      S3_BUCKET_DOCUMENTS: 'docs',
      S3_BUCKET_MEDIA: 'media',
      S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
      S3_SECRET_ACCESS_KEY: 'secret-secret-secret-secret',
    }),
    { setContext: jest.fn(), warn: jest.fn() } as never,
  );
  (svc as unknown as { client: unknown }).client = fake;
  return svc;
}

/** Heap + off-heap buffers: what a whole-file buffer would show up in. */
const used = () => {
  const m = process.memoryUsage();
  return m.heapUsed + m.external + m.arrayBuffers;
};

describe('export-stream primitives', () => {
  it('pagedById walks every page and stops at maxRows', async () => {
    const data = Array.from({ length: 25 }, (_, i) => ({
      id: String(i + 100),
    }));
    const fetch = jest.fn((after: string | undefined, take: number) =>
      Promise.resolve(
        data.filter((r) => !after || r.id > after).slice(0, take),
      ),
    );
    const all: string[] = [];
    for await (const r of pagedById(fetch, { pageSize: 10 })) all.push(r.id);
    expect(all).toHaveLength(25);
    expect(fetch).toHaveBeenCalledTimes(3);
    const capped: string[] = [];
    for await (const r of pagedById(fetch, { pageSize: 10, maxRows: 12 })) {
      capped.push(r.id);
    }
    expect(capped).toHaveLength(12);
  });

  it('pagedBySkip walks every page', async () => {
    const data = Array.from({ length: 7 }, (_, i) => i);
    const out: number[] = [];
    for await (const r of pagedBySkip(
      (skip, take) => Promise.resolve(data.slice(skip, skip + take)),
      { pageSize: 3 },
    )) {
      out.push(r);
    }
    expect(out).toEqual(data);
  });

  it('jsonArrayStream / jsonObjectStream produce valid JSON', async () => {
    const read = async (s: AsyncIterable<unknown>) => {
      let t = '';
      for await (const c of s) t += String(c);
      return t;
    };
    const rows = [{ a: 1n, d: new Date('2026-01-01T00:00:00Z') }, { a: 2n }];
    expect(JSON.parse(await read(jsonArrayStream(rows)))).toEqual([
      { a: '1', d: '2026-01-01T00:00:00.000Z' },
      { a: '2' },
    ]);
    expect(JSON.parse(await read(jsonArrayStream([])))).toEqual([]);
    async function* gen() {
      yield { x: 1 };
    }
    expect(
      JSON.parse(
        await read(jsonObjectStream({ posts: gen(), n: 3, empty: [] })),
      ),
    ).toEqual({ posts: [{ x: 1 }], n: 3, empty: [] });
  });

  it('fails the stream when the size limit is crossed', async () => {
    const h = new CountingHash({ maxBytes: 10, maxMs: 1000 });
    const err = new Promise<Error>((resolve) => h.once('error', resolve));
    h.write(Buffer.alloc(11));
    const e = await err;
    expect(e).toBeInstanceOf(ExportLimitError);
    expect((e as ExportLimitError).kind).toBe('bytes');
  });

  it('aborts the multipart upload when the export fails half way', async () => {
    const fake = new FakeS3();
    const storage = storageWith(fake);
    async function* boom() {
      for (let i = 0; i < 4000; i++) yield { i, pad: 'x'.repeat(4000) };
      throw new Error('database went away');
    }
    const zip = createZipExport((a) => {
      a.append(jsonArrayStream(boom()), { name: 'm.json' });
    });
    await expect(
      storage.putStream('docs', 'k.zip', zip.body, 'application/zip', {
        partSizeBytes: 5 * 1024 * 1024,
      }),
    ).rejects.toThrow();
    expect(fake.completed).toBe(false);
  });

  it('streams 50 000 messages + 500 file rows to S3 under a memory ceiling', async () => {
    const fake = new FakeS3();
    const storage = storageWith(fake);
    const MESSAGES = 50_000;
    const FILES = 500;
    // ~4 KB of incompressible text per message: 200 MB of JSON in total.
    async function* messages() {
      for (let i = 0; i < MESSAGES; i++) {
        yield {
          id: `m${i}`,
          conversation_id: 'c1',
          body_original: randomBytes(2000).toString('hex'),
          created_at: new Date(1_700_000_000_000 + i * 1000),
        };
        if (i % 2000 === 0) await new Promise((r) => setImmediate(r));
      }
    }
    async function* files() {
      for (let i = 0; i < FILES; i++) {
        yield { fileId: `f${i}`, mime: 'application/pdf', sizeBytes: 1e6 + i };
      }
    }
    const gc = (global as { gc?: () => void }).gc;
    gc?.();
    const base = used();
    let peak = 0;
    const sampler = setInterval(() => {
      peak = Math.max(peak, used() - base);
    }, 20);
    let rows = 0;
    const zip = createZipExport(
      (a) => {
        a.append(
          jsonArrayStream(messages(), () => {
            rows += 1;
          }),
          { name: 'messages.json' },
        );
        a.append(jsonArrayStream(files()), { name: 'media.json' });
      },
      { level: 1 },
    );
    await storage.putStream('docs', 'big.zip', zip.body, 'application/zip');
    clearInterval(sampler);
    peak = Math.max(peak, used() - base);

    expect(rows).toBe(MESSAGES);
    expect(fake.completed).toBe(true);
    expect(fake.parts).toBeGreaterThan(5);
    // The upload really was split into parts, none bigger than ~2 parts.
    expect(fake.maxPart).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(zip.body.bytes).toBe(fake.bytes);
    expect(zip.body.bytes).toBeGreaterThan(150 * 1024 * 1024);
    // Peak extra memory stays far below the export size (a whole-file
    // buffer would need >= the zip size, 150 MB+, plus the JSON text).
    const ceilingMb = 120;
    // eslint-disable-next-line no-console
    console.log(
      `export ${Math.round(zip.body.bytes / 1048576)} MB, peak +${Math.round(peak / 1048576)} MB`,
    );
    expect(peak).toBeLessThan(ceilingMb * 1024 * 1024);
  });
});
