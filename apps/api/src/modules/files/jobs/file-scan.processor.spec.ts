import { createHash } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { FileScanProcessor } from './file-scan.processor';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { S3StorageService } from '../storage/s3-storage.service';
import type { ImageProcessor } from '../processing/image-processor';
import {
  ClamdTooLargeError,
  DevEicarScanner,
  EICAR_SIGNATURE,
  type VirusScanner,
} from '../scanning/virus-scanner';

const PDF = Buffer.from('%PDF-1.4 clean');

function make(opts: {
  scanner: VirusScanner | null;
  data?: Buffer;
  status?: string;
  purpose?: string;
  readError?: Error;
  bucket?: string;
  size?: number;
}) {
  const prisma = {
    file: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'f1',
        purpose: opts.purpose ?? 'verification_document',
        scan_status: opts.status ?? 'pending',
        s3_bucket: opts.bucket ?? 'b',
        s3_key: 'k',
        size_bytes: BigInt(opts.size ?? 100),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = {
    read: opts.readError
      ? jest.fn().mockRejectedValue(opts.readError)
      : jest.fn().mockResolvedValue(opts.data ?? PDF),
    remove: jest.fn(),
    put: jest.fn(),
  };
  const images = {
    process: jest.fn().mockResolvedValue({
      main: null,
      variants: new Map(),
      width: null,
      height: null,
    }),
  };
  const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const processor = new FileScanProcessor(
    prisma as unknown as PrismaService,
    storage as unknown as S3StorageService,
    images as unknown as ImageProcessor,
    opts.scanner,
    logger as unknown as PinoLogger,
  );
  return { processor, prisma, storage, images, logger };
}

describe('FileScanProcessor', () => {
  it('clean file → clean (guarded on pending)', async () => {
    const { processor, prisma } = make({ scanner: new DevEicarScanner() });
    expect(await processor.run('f1', false)).toBe('clean');
    expect(prisma.file.updateMany).toHaveBeenCalledWith({
      where: { id: 'f1', scan_status: 'pending' },
      data: expect.objectContaining({ scan_status: 'clean' }) as unknown,
    });
  });

  it('an object in the R2 bucket is read, scanned and deleted in that same bucket', async () => {
    const infected = make({
      scanner: new DevEicarScanner(),
      data: Buffer.from(`%PDF-1.4 ${EICAR_SIGNATURE}`),
      bucket: 'lawbid-public-r2',
    });
    expect(await infected.processor.run('f1', false)).toBe('infected');
    expect(infected.storage.read).toHaveBeenCalledWith('lawbid-public-r2', 'k');
    expect(infected.storage.remove).toHaveBeenCalledWith('lawbid-public-r2', [
      'k',
    ]);
    const clean = make({
      scanner: new DevEicarScanner(),
      bucket: 'lawbid-public-r2',
    });
    expect(await clean.processor.run('f1', false)).toBe('clean');
    expect(clean.storage.read).toHaveBeenCalledWith('lawbid-public-r2', 'k');
  });

  it('EICAR → infected, object deleted, never processed', async () => {
    const { processor, prisma, storage, images } = make({
      scanner: new DevEicarScanner(),
      data: Buffer.from(`%PDF-1.4 ${EICAR_SIGNATURE}`),
    });
    expect(await processor.run('f1', false)).toBe('infected');
    expect(storage.remove).toHaveBeenCalledWith('b', ['k']);
    expect(images.process).not.toHaveBeenCalled();
    expect(prisma.file.updateMany).toHaveBeenCalledWith({
      where: { id: 'f1', scan_status: 'pending' },
      data: { scan_status: 'infected' },
    });
  });

  it('no scanner (production without CLAMAV_HOST) → stays pending and warns', async () => {
    const { processor, prisma, logger } = make({ scanner: null });
    expect(await processor.run('f1', false)).toBe('skipped:no-scanner');
    expect(prisma.file.updateMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('scanner outage: retried, then failed on the last attempt', async () => {
    const broken: VirusScanner = {
      name: 'x',
      scan: () => Promise.reject(new Error('down')),
    };
    await expect(
      make({ scanner: broken }).processor.run('f1', false),
    ).rejects.toThrow('down');
    const last = make({ scanner: broken });
    expect(await last.processor.run('f1', true)).toBe('failed');
    expect(last.prisma.file.updateMany).toHaveBeenCalledWith({
      where: { id: 'f1', scan_status: 'pending' },
      data: { scan_status: 'failed' },
    });
  });

  it('undecodable image → failed and deleted', async () => {
    const { processor, images, storage } = make({
      scanner: new DevEicarScanner(),
      data: Buffer.from([0xff, 0xd8, 0xff, 0, 0]),
      purpose: 'avatar',
    });
    images.process.mockRejectedValue(new Error('corrupt'));
    expect(await processor.run('f1', false)).toBe('failed');
    expect(storage.remove).toHaveBeenCalledWith('b', ['k']);
  });

  it('skips files that are no longer pending', async () => {
    const { processor, storage } = make({
      scanner: new DevEicarScanner(),
      status: 'clean',
    });
    expect(await processor.run('f1', false)).toBe('skipped:not-pending');
    expect(storage.read).not.toHaveBeenCalled();
  });

  // Owner 2026-11-09 («фото обрабатываются долго»): the row is still pending,
  // so the processed main is stored together with its variants (one trip to
  // R2), and the placeholder is made from the smallest picture.
  it('a post photo: main and variants are stored at once', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    const { processor, images, storage } = make({
      scanner: new DevEicarScanner(),
      data: jpeg,
      purpose: 'post_image',
    });
    const pic = (w: number) => ({
      data: Buffer.from(`webp-${w}`),
      mime: 'image/webp',
      width: w,
      height: w,
    });
    images.process.mockResolvedValue({
      main: pic(1440),
      variants: new Map([
        [320, pic(320)],
        [1080, pic(1080)],
      ]),
      width: 1440,
      height: 1440,
    });
    const started: string[] = [];
    const finish: Array<() => void> = [];
    storage.put.mockImplementation(
      (_b: string, key: string) =>
        new Promise<void>((resolve) => {
          started.push(key);
          finish.push(resolve);
        }),
    );
    const run = processor.run('f1', false);
    for (let i = 0; i < 20 && started.length < 3; i++) {
      await new Promise((r) => setImmediate(r));
    }
    expect([...started].sort()).toEqual(['k', 'k_w1080', 'k_w320']);
    finish.forEach((f) => f());
    expect(await run).toBe('clean');
  });

  describe('after a light confirm (R-252): source_sha256 is empty', () => {
    const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    const row = (over: Record<string, unknown>) => ({
      id: 'f1',
      purpose: 'chat_attachment',
      scan_status: 'pending',
      s3_bucket: 'b',
      s3_key: 'k',
      mime: 'application/pdf',
      source_sha256: null,
      sha256: sha(PDF),
      ...over,
    });
    const scanner = { name: 't', scan: jest.fn() };

    beforeEach(() => {
      scanner.scan.mockReset();
      scanner.scan.mockResolvedValue({ infected: false });
    });

    it('the true hash goes on to the scan, and the bytes are read once', async () => {
      const { processor, prisma, storage } = make({ scanner });
      prisma.file.findUnique.mockResolvedValue(row({}));
      expect(await processor.run('f1', false)).toBe('clean');
      expect(storage.read).toHaveBeenCalledTimes(1);
      expect(scanner.scan).toHaveBeenCalledTimes(1);
      expect(prisma.file.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { source_sha256: sha(PDF) },
        }),
      );
    });

    it('a false hash: removed, failed, never scanned or deduplicated', async () => {
      const { processor, prisma, storage } = make({ scanner });
      storage.remove.mockResolvedValue(undefined);
      prisma.file.findUnique.mockResolvedValue(
        row({ sha256: 'someone-elses-hash' }),
      );
      expect(await processor.run('f1', false)).toBe('failed');
      expect(storage.remove).toHaveBeenCalledWith('b', ['k']);
      expect(scanner.scan).not.toHaveBeenCalled();
      expect(prisma.file.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { scan_status: 'failed' } }),
      );
      const shared = (
        prisma.file.updateMany.mock.calls as [{ data: object }][]
      ).some(([c]) => 's3_key' in c.data);
      expect(shared).toBe(false);
    });

    it('active content inside: removed and failed', async () => {
      const bad = Buffer.from('%PDF-1.7 /JavaScript (app.alert(1))');
      const { processor, prisma, storage } = make({ scanner, data: bad });
      storage.remove.mockResolvedValue(undefined);
      prisma.file.findUnique.mockResolvedValue(row({ sha256: sha(bad) }));
      expect(await processor.run('f1', false)).toBe('failed');
      expect(storage.remove).toHaveBeenCalledWith('b', ['k']);
    });

    it('storage does not answer: retried, and failed on the last try', async () => {
      const readError = new Error('s3 down');
      const first = make({ scanner, readError });
      first.prisma.file.findUnique.mockResolvedValue(row({}));
      await expect(first.processor.run('f1', false)).rejects.toThrow('s3 down');
      const last = make({ scanner, readError });
      last.prisma.file.findUnique.mockResolvedValue(row({}));
      expect(await last.processor.run('f1', true)).toBe('failed');
    });

    it('a normal row (hash proven at confirm) is not read an extra time', async () => {
      const { processor, prisma, storage } = make({ scanner });
      prisma.file.findUnique.mockResolvedValue(
        row({ source_sha256: sha(PDF) }),
      );
      expect(await processor.run('f1', false)).toBe('clean');
      expect(storage.read).toHaveBeenCalledTimes(1);
    });
  });
});

/** Media batch A (R1, audit 13.11): a file over the antivirus limit was
 * deleted after a successful upload. Now it is kept and set aside. */
describe('FileScanProcessor: over the antivirus size limit (R1)', () => {
  const MB = 1024 * 1024;
  const setAside = {
    where: { id: 'f1', scan_status: 'pending' },
    data: { scan_status: 'failed', scan_skipped: 'too_large' },
  };

  it('clamd answers «size limit exceeded»: kept (never deleted), set aside, no retry', async () => {
    const tooBig: VirusScanner = {
      name: 'clamd',
      scan: () =>
        Promise.reject(new ClamdTooLargeError('clamd error: size limit')),
    };
    // Not the last attempt: still final, a retry gives the same answer.
    const { processor, prisma, storage, logger } = make({ scanner: tooBig });
    expect(await processor.run('f1', false)).toBe('skipped:too-large');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(prisma.file.updateMany).toHaveBeenCalledWith(setAside);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'scan_skipped_too_large' }),
      expect.any(String),
    );
  });

  it('over the scanner limit (CLAMAV_MAX_MB): not read, not sent to clamd, kept', async () => {
    const scan = jest.fn();
    const scanner: VirusScanner = { name: 'clamd', maxBytes: 110 * MB, scan };
    const { processor, prisma, storage } = make({
      scanner,
      size: 111 * MB,
    });
    expect(await processor.run('f1', true)).toBe('skipped:too-large');
    expect(scan).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(prisma.file.updateMany).toHaveBeenCalledWith(setAside);
  });

  it('at the limit or with no known limit: scanned as before', async () => {
    const atLimit = make({
      scanner: Object.assign(new DevEicarScanner(), { maxBytes: 110 * MB }),
      size: 110 * MB,
    });
    expect(await atLimit.processor.run('f1', false)).toBe('clean');
    const unknown = make({ scanner: new DevEicarScanner(), size: 500 * MB });
    expect(await unknown.processor.run('f1', false)).toBe('clean');
  });

  it('a scanner outage is still retried and never sets the file aside', async () => {
    const broken: VirusScanner = {
      name: 'clamd',
      scan: () => Promise.reject(new Error('down')),
    };
    const last = make({ scanner: broken });
    expect(await last.processor.run('f1', true)).toBe('failed');
    expect(last.prisma.file.updateMany).toHaveBeenCalledWith({
      where: { id: 'f1', scan_status: 'pending' },
      data: { scan_status: 'failed' },
    });
  });
});
