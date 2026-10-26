import { R2_FREE_BYTES, StorageStatsService } from './storage-stats.service';

function make(opts: {
  usage: { bytes: number; objects: number; truncated: boolean } | null;
  previous?: { bytes: number; objects: number };
  growthPct?: number;
}) {
  let stored: string | null = opts.previous
    ? JSON.stringify({ ...opts.previous, truncated: false, updatedAt: 'x' })
    : null;
  const redis = {
    get: jest.fn(() => Promise.resolve(stored)),
    set: jest.fn((_k: string, v: string) => {
      stored = v;
      return Promise.resolve('OK');
    }),
  };
  const logger = { setContext: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  const storage = {
    publicStoreUsage: jest.fn(() => Promise.resolve(opts.usage)),
  };
  const settings = {
    number: jest.fn(() => Promise.resolve(opts.growthPct ?? 50)),
  };
  const Ctor = StorageStatsService as unknown as new (
    ...a: unknown[]
  ) => StorageStatsService;
  return {
    svc: new Ctor(null, settings, logger, storage, redis),
    logger,
    redis,
  };
}

const alerts = (logger: { warn: jest.Mock }) =>
  logger.warn.mock.calls
    .map((c) => (c[0] as { alert?: string }).alert)
    .filter(Boolean);

describe('StorageStatsService.refreshR2Usage', () => {
  it('does nothing when R2 has no keys', async () => {
    const { svc, redis } = make({ usage: null });
    expect(await svc.refreshR2Usage()).toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
    expect(await svc.r2Usage()).toBeNull();
  });

  it('keeps the count for the admin and stays quiet under 10 GB', async () => {
    const { svc, logger } = make({
      usage: { bytes: 5_000, objects: 10, truncated: false },
    });
    const u = await svc.refreshR2Usage(new Date('2026-10-24T03:00:00Z'));
    expect(u).toMatchObject({ bytes: 5_000, objects: 10 });
    expect(await svc.r2Usage()).toMatchObject({ objects: 10 });
    expect(alerts(logger)).toEqual([]);
  });

  it('alerts past the 10 GB free tier', async () => {
    const { svc, logger } = make({
      usage: { bytes: R2_FREE_BYTES + 1, objects: 5, truncated: false },
    });
    await svc.refreshR2Usage();
    expect(alerts(logger)).toEqual(['r2_storage_high']);
  });

  it('alerts when the object count jumps more than the growth percent', async () => {
    const { svc, logger } = make({
      usage: { bytes: 1, objects: 2_000, truncated: false },
      previous: { bytes: 1, objects: 1_000 },
    });
    await svc.refreshR2Usage();
    expect(alerts(logger)).toEqual(['r2_ops_high']);
  });

  it('does not alert on a small base, and never throws when R2 fails', async () => {
    const small = make({
      usage: { bytes: 1, objects: 90, truncated: false },
      previous: { bytes: 1, objects: 10 },
    });
    await small.svc.refreshR2Usage();
    expect(alerts(small.logger)).toEqual([]);

    const broken = make({ usage: null });
    (
      broken.svc as unknown as { storage: { publicStoreUsage: jest.Mock } }
    ).storage.publicStoreUsage.mockRejectedValue(new Error('R2 403'));
    await expect(broken.svc.refreshR2Usage()).resolves.toBeNull();
  });
});
