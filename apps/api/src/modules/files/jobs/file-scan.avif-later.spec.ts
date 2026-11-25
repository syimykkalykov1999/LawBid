import type { PinoLogger } from 'nestjs-pino';
import { FileScanProcessor } from './file-scan.processor';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { S3StorageService } from '../storage/s3-storage.service';
import type { ImageProcessor } from '../processing/image-processor';
import type { RealtimePublisher } from '../../realtime/realtime-publisher.service';
import { DevEicarScanner } from '../scanning/virus-scanner';

// A PNG header: enough for the magic-byte check; the encoder is mocked.
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48,
  0x44, 0x52,
]);

type Quality = { avif: unknown };

/**
 * M4 (owner 24.11, Meta 2022: costly copies off the send path): a chat photo
 * turns `clean` (and `file:ready` goes out) before its AVIF twins are
 * encoded; the twins follow and only then is `avif_twins` set.
 */
describe('FileScanProcessor: AVIF twins after clean', () => {
  function make(avifOn: boolean) {
    const order: string[] = [];
    const prisma = {
      file: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'f1',
          owner_user_id: 'u1',
          purpose: 'chat_attachment',
          mime: 'image/png',
          scan_status: 'pending',
          s3_bucket: 'b',
          s3_key: 'k',
          size_bytes: BigInt(PNG.length),
          source_sha256: 'x',
          sha256: 'x',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn((a: { data: Record<string, unknown> }) => {
          order.push(
            a.data.scan_status === 'clean'
              ? 'clean'
              : a.data.avif_twins === true
                ? 'twins-flag'
                : 'update',
          );
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const storage = {
      read: jest.fn().mockResolvedValue(PNG),
      remove: jest.fn(),
      put: jest.fn().mockResolvedValue(undefined),
      isPublicStoreBucket: () => false,
    };
    const img = (avif: boolean) => ({
      data: Buffer.from('webp'),
      mime: 'image/webp',
      width: 10,
      height: 10,
      ...(avif
        ? {
            avif: {
              data: Buffer.from('avif'),
              mime: 'image/avif',
              width: 10,
              height: 10,
            },
          }
        : {}),
    });
    const images = {
      process: jest.fn((input: { quality: Quality }) => {
        const twins = input.quality.avif !== null;
        order.push(twins ? 'encode-avif' : 'encode');
        return Promise.resolve({
          main: img(twins),
          variants: new Map([[256, img(twins)]]),
          width: 10,
          height: 10,
        });
      }),
    };
    const settings = {
      number: () => Promise.resolve(0),
      boolean: (k: string) =>
        Promise.resolve(k === 'images.avif_enabled' ? avifOn : false),
      string: () => Promise.resolve(''),
      raw: () => Promise.resolve(undefined),
    };
    const realtime = {
      toUsers: jest.fn(() => order.push('file:ready')),
    };
    const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const processor = new FileScanProcessor(
      prisma as unknown as PrismaService,
      storage as unknown as S3StorageService,
      images as unknown as ImageProcessor,
      new DevEicarScanner(),
      logger as unknown as PinoLogger,
      settings as never,
      undefined,
      undefined,
      realtime as unknown as RealtimePublisher,
    );
    return { processor, order, images, storage, prisma };
  }

  it('marks clean and pushes file:ready before the AVIF encode', async () => {
    const { processor, order, storage, prisma } = make(true);
    expect(await processor.run('f1', false)).toBe('clean');
    expect(order).toEqual([
      'encode',
      'clean',
      'file:ready',
      'encode-avif',
      'twins-flag',
    ]);
    expect(prisma.file.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'f1', scan_status: 'clean' },
      data: { avif_twins: true },
    });
    const keys = storage.put.mock.calls.map((c: unknown[]) => c[1] as string);
    expect(keys.some((k) => k.endsWith('.avif'))).toBe(true);
  });

  it('with AVIF off nothing is encoded twice', async () => {
    const { processor, order } = make(false);
    expect(await processor.run('f1', false)).toBe('clean');
    expect(order).toEqual(['encode', 'clean', 'file:ready']);
  });
});
