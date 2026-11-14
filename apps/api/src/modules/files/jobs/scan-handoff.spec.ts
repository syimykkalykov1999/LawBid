import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { FileScanProcessor } from './file-scan.processor';
import { ScanHandoff, scanHandoffKey } from './scan-handoff';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { S3StorageService } from '../storage/s3-storage.service';
import type { ImageProcessor } from '../processing/image-processor';
import { DevEicarScanner, EICAR_SIGNATURE } from '../scanning/virus-scanner';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { RealtimePublisher } from '../../realtime/realtime-publisher.service';

/** Owner row 106 (media audit 13.11, batch F item 14). */

const PDF = Buffer.from('%PDF-1.4 clean');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** An in-memory Redis with what the handoff uses. */
function fakeRedis() {
  const store = new Map<string, { value: Buffer; ttl: number }>();
  return {
    store,
    status: 'ready',
    set: jest.fn((key: string, value: Buffer, _ex: string, ttl: number) => {
      store.set(key, { value, ttl });
      return Promise.resolve('OK');
    }),
    getdelBuffer: jest.fn((key: string) => {
      const v = store.get(key);
      store.delete(key);
      return Promise.resolve(v?.value ?? null);
    }),
  };
}

function settings(values: Record<string, number | boolean>) {
  return {
    number: jest.fn((k: string) => Promise.resolve(values[k] as number)),
    boolean: jest.fn((k: string) => Promise.resolve(values[k] === true)),
    string: jest.fn(() => Promise.resolve('webp')),
  };
}

const on = {
  'files.scan_handoff_max_kb': 8192,
  'files.scan_handoff_ttl_s': 120,
};

describe('ScanHandoff', () => {
  it('keeps the bytes for the admin seconds and gives them back once', async () => {
    const redis = fakeRedis();
    const h = new ScanHandoff(
      redis as unknown as Redis,
      settings(on) as unknown as AppSettingsService,
    );
    expect(await h.stash('f1', PDF)).toBe(true);
    expect(redis.store.get(scanHandoffKey('f1'))?.ttl).toBe(120);
    const file = {
      id: 'f1',
      size_bytes: BigInt(PDF.length),
      source_sha256: sha(PDF),
    };
    expect(await h.take(file)).toEqual(PDF);
    expect(await h.take(file)).toBeNull();
  });

  it('0 KB = off; a file over the admin size is not kept', async () => {
    const redis = fakeRedis();
    const off = new ScanHandoff(
      redis as unknown as Redis,
      settings({ ...on, 'files.scan_handoff_max_kb': 0 }) as never,
    );
    expect(await off.stash('f1', PDF)).toBe(false);
    const tiny = new ScanHandoff(
      redis as unknown as Redis,
      settings({ ...on, 'files.scan_handoff_max_kb': 1 }) as never,
    );
    expect(await tiny.stash('f2', Buffer.alloc(2048))).toBe(false);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('bytes that are not the confirmed ones are never used', async () => {
    const redis = fakeRedis();
    const h = new ScanHandoff(
      redis as unknown as Redis,
      settings(on) as unknown as AppSettingsService,
    );
    await h.stash('f1', PDF);
    expect(
      await h.take({
        id: 'f1',
        size_bytes: BigInt(PDF.length),
        source_sha256: sha(Buffer.from('other')),
      }),
    ).toBeNull();
  });

  it('Redis down: nothing kept, nothing thrown', async () => {
    const h = new ScanHandoff(
      { status: 'end' } as unknown as Redis,
      settings(on) as unknown as AppSettingsService,
    );
    expect(await h.stash('f1', PDF)).toBe(false);
    expect(
      await h.take({ id: 'f1', size_bytes: 1n, source_sha256: 'x' }),
    ).toBeNull();
  });
});

describe('FileScanProcessor with the handoff and file:ready', () => {
  function make(data: Buffer, stashed: boolean) {
    const row = {
      id: 'f1',
      owner_user_id: 'u1',
      purpose: 'chat_attachment',
      scan_status: 'pending',
      s3_bucket: 'b',
      s3_key: 'k',
      size_bytes: BigInt(data.length),
      sha256: sha(data),
      source_sha256: sha(data),
      mime: 'application/pdf',
    };
    const prisma = {
      file: {
        findUnique: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = {
      read: jest.fn().mockResolvedValue(data),
      remove: jest.fn(),
      put: jest.fn(),
      isPublicStoreBucket: jest.fn().mockReturnValue(false),
    };
    const images = {
      process: jest.fn().mockResolvedValue({
        main: null,
        variants: new Map(),
        width: null,
        height: null,
      }),
    };
    const redis = fakeRedis();
    if (stashed) {
      redis.store.set(scanHandoffKey('f1'), { value: data, ttl: 120 });
    }
    const handoff = new ScanHandoff(
      redis as unknown as Redis,
      settings(on) as unknown as AppSettingsService,
    );
    const realtime = { toUsers: jest.fn() };
    const logger = { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const processor = new FileScanProcessor(
      prisma as unknown as PrismaService,
      storage as unknown as S3StorageService,
      images as unknown as ImageProcessor,
      new DevEicarScanner(),
      logger as unknown as PinoLogger,
      settings({ 'images.keep_small_originals': true }) as never,
      undefined,
      handoff,
      realtime as unknown as RealtimePublisher,
    );
    return { processor, storage, images, realtime };
  }

  it('uses the bytes confirm kept: no second read of the object', async () => {
    const { processor, storage, images, realtime } = make(PDF, true);
    expect(await processor.run('f1', false)).toBe('clean');
    expect(storage.read).not.toHaveBeenCalled();
    expect(images.process).toHaveBeenCalledWith(
      expect.objectContaining({ keepSmallOriginal: true }),
    );
    expect(realtime.toUsers).toHaveBeenCalledWith(['u1'], 'file:ready', {
      fileId: 'f1',
      scanStatus: 'clean',
    });
  });

  it('nothing kept: reads the object as before', async () => {
    const { processor, storage } = make(PDF, false);
    expect(await processor.run('f1', false)).toBe('clean');
    expect(storage.read).toHaveBeenCalledWith('b', 'k');
  });

  it('an infected upload is pushed as infected', async () => {
    const bad = Buffer.from(`%PDF-1.4 ${EICAR_SIGNATURE}`);
    const { processor, realtime } = make(bad, true);
    expect(await processor.run('f1', false)).toBe('infected');
    expect(realtime.toUsers).toHaveBeenCalledWith(['u1'], 'file:ready', {
      fileId: 'f1',
      scanStatus: 'infected',
    });
  });
});
