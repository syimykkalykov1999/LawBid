import type { HttpException } from '@nestjs/common';
import type Redis from 'ioredis';
import { FilesService, multipartKey } from './files.service';
import { MIB } from './multipart';

const SIZE = 20 * MIB; // 3 parts: 8 + 8 + 4 MiB

function make(
  opts: { flag?: boolean; uploaded?: number[]; size?: number } = {},
) {
  const store = new Map<string, string>();
  const size = opts.size ?? SIZE;
  store.set(
    'files:upload:f1',
    JSON.stringify({
      userId: 'u1',
      purpose: 'post_video',
      mime: 'video/mp4',
      size,
      sha256: 'a'.repeat(64),
      bucket: 'b',
      key: 'k',
    }),
  );
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string, ...a: unknown[]) => {
      if (a.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(store.delete(k) ? 1 : 0)),
    expire: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
  };
  const sizes = [8 * MIB, 8 * MIB, 4 * MIB];
  const storage = {
    startMultipart: jest.fn().mockResolvedValue('UP1'),
    abortMultipart: jest.fn().mockResolvedValue(undefined),
    presignPart: jest.fn(({ partNumber }: { partNumber: number }) =>
      Promise.resolve(`https://s3/part/${partNumber}`),
    ),
    listParts: jest.fn(() =>
      Promise.resolve(
        (opts.uploaded ?? []).map((n) => ({
          partNumber: n,
          size: sizes[n - 1],
          etag: `e${n}`,
        })),
      ),
    ),
    completeMultipart: jest.fn().mockResolvedValue(undefined),
    head: jest.fn().mockResolvedValue(null),
  };
  const rateLimit = {
    consumeFixedWindow: jest
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 }),
  };
  const flags = { isEnabled: jest.fn().mockResolvedValue(opts.flag ?? true) };
  const service = new FilesService(
    {} as never,
    redis as unknown as Redis,
    storage as never,
    {} as never,
    {} as never,
    rateLimit as never,
    {} as never,
    {} as never,
    { setContext: jest.fn() } as never,
    flags as never,
  );
  return { service, redis, storage, store, flags, rateLimit };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: HttpException) => (e.getResponse() as { code: string }).code,
  );

describe('FilesService resumable (multipart) uploads', () => {
  it('is off until the files_multipart flag is on', async () => {
    const { service } = make({ flag: false });
    expect(await code(service.multipartPlan('u1', 'f1'))).toBe(
      'FEATURE_DISABLED',
    );
  });

  it("hides another user's upload", async () => {
    const { service } = make();
    expect(await code(service.multipartPlan('other', 'f1'))).toBe('NOT_FOUND');
  });

  it('refuses a file small enough for one request', async () => {
    const { service } = make({ size: 5 * MIB });
    expect(await code(service.multipartPlan('u1', 'f1'))).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('first call starts the upload and returns links for every part', async () => {
    const { service, storage, store, redis } = make();
    const plan = await service.multipartPlan('u1', 'f1');
    expect(storage.startMultipart).toHaveBeenCalledWith({
      bucket: 'b',
      key: 'k',
      contentType: 'video/mp4',
    });
    expect(store.get(multipartKey('f1'))).toBe('UP1');
    expect(plan.partSizeBytes).toBe(8 * MIB);
    expect(plan.partCount).toBe(3);
    expect(plan.uploadedParts).toEqual([]);
    expect(plan.parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    // The longer window keeps the upload (and its cleanup record) alive.
    expect(redis.expire).toHaveBeenCalledWith('files:upload:f1', 24 * 3600);
  });

  it('a resume sends links only for the parts S3 lacks and starts nothing', async () => {
    const { service, storage, store } = make({ uploaded: [1, 3] });
    store.set(multipartKey('f1'), 'UP1');
    const plan = await service.multipartPlan('u1', 'f1');
    expect(storage.startMultipart).not.toHaveBeenCalled();
    expect(plan.uploadedParts).toEqual([1, 3]);
    expect(plan.parts.map((p) => p.partNumber)).toEqual([2]);
  });

  it('a lost start race uses the winner and aborts its own upload', async () => {
    const { service, storage, redis, store } = make();
    // The first read of the upload id sees nothing; then a parallel request
    // stores its own before our SET NX.
    let reads = 0;
    const real = redis.get.getMockImplementation()!;
    redis.get.mockImplementation((k: string) => {
      if (k === multipartKey('f1') && reads++ === 0)
        return Promise.resolve(null);
      return real(k);
    });
    store.set(multipartKey('f1'), 'WINNER');
    await service.multipartPlan('u1', 'f1');
    expect(storage.abortMultipart).toHaveBeenCalledWith('b', 'k', 'UP1');
    expect(storage.listParts).toHaveBeenCalledWith('b', 'k', 'WINNER');
  });

  it('complete refuses while a part is missing', async () => {
    const { service, storage, store } = make({ uploaded: [1, 2] });
    store.set(multipartKey('f1'), 'UP1');
    expect(await code(service.multipartComplete('u1', 'f1'))).toBe(
      'FILE_NOT_UPLOADED',
    );
    expect(storage.completeMultipart).not.toHaveBeenCalled();
  });

  it('complete assembles exactly the uploaded parts, once', async () => {
    const { service, storage, store } = make({ uploaded: [1, 2, 3] });
    store.set(multipartKey('f1'), 'UP1');
    await expect(service.multipartComplete('u1', 'f1')).resolves.toEqual({
      sizeBytes: SIZE,
    });
    expect(storage.completeMultipart).toHaveBeenCalledWith(
      'b',
      'k',
      'UP1',
      expect.arrayContaining([{ partNumber: 3, size: 4 * MIB, etag: 'e3' }]),
    );
    expect(store.has(multipartKey('f1'))).toBe(false);
  });

  it('complete is safe to retry after it succeeded', async () => {
    const { service, storage } = make();
    storage.head.mockResolvedValue({ size: SIZE });
    await expect(service.multipartComplete('u1', 'f1')).resolves.toEqual({
      sizeBytes: SIZE,
    });
    expect(storage.completeMultipart).not.toHaveBeenCalled();
  });
});
