import type { PinoLogger } from 'nestjs-pino';
import { FileScanProcessor } from './file-scan.processor';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { S3StorageService } from '../storage/s3-storage.service';
import type { ImageProcessor } from '../processing/image-processor';
import {
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
}) {
  const prisma = {
    file: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'f1',
        purpose: opts.purpose ?? 'verification_document',
        scan_status: opts.status ?? 'pending',
        s3_bucket: 'b',
        s3_key: 'k',
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
});
