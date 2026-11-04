import { countingPrisma } from '../../prisma/query-counter.test-support';
import { AdminPricingService } from '../admin-billing/admin-pricing.service';
import { AdminVideosService } from './admin-videos.service';

/**
 * Data-layer audit 2026-11-04 (R-395): admin aggregates over whole tables
 * come from the shared summary (AdminSummaryService), not from a recount
 * on every page open.
 */
function summary(stored: unknown) {
  return {
    get: jest.fn((_key: string, compute: () => Promise<unknown>) =>
      stored === undefined
        ? compute().then((data) => ({ data, computedAt: '' }))
        : Promise.resolve({ data: stored, computedAt: '' }),
    ),
  };
}

describe('Admin video stats', () => {
  it('a stored summary answers with 0 queries (was 4 per open)', async () => {
    const q = countingPrisma();
    const stats = { byStatus: [], storageBytes: 1, uploads7d: 2, failed7d: 0 };
    const s = summary(stats);
    const svc = new AdminVideosService(
      q.prisma as never,
      {} as never,
      {} as never,
      {} as never,
      s as never,
    );
    await expect(svc.stats()).resolves.toEqual(stats);
    expect(q.count()).toBe(0);
    expect(s.get.mock.calls[0][0]).toBe('video-stats');
  });

  it('the first computation is the same 4 queries, shared', async () => {
    const q = countingPrisma({
      'videoAsset.aggregate': { _sum: { storage_bytes: 5 } },
    });
    const svc = new AdminVideosService(
      q.prisma as never,
      {} as never,
      {} as never,
      {} as never,
      summary(undefined) as never,
    );
    await expect(svc.stats()).resolves.toMatchObject({ storageBytes: 5 });
    expect(q.count()).toBe(4);
  });
});

describe('Admin plan prices: subscriber counts', () => {
  it('come from the summary: the page costs 1 query, not 5', async () => {
    const q = countingPrisma();
    const pricing = {
      activeRows: () => Promise.resolve(new Map()),
      amounts: () => Promise.resolve({}),
      defaults: () => Promise.resolve({}),
      mode: () => 'test',
      currency: () => 'usd',
    };
    const counts = { monthly: 3, seat: 1, yearly: 2, client_badge: 4 };
    const s = summary(counts);
    const svc = new AdminPricingService(
      q.prisma as never,
      pricing as never,
      {} as never,
      {} as never,
      s as never,
    );
    await svc.list();
    // Only the price history page; the 4 counts are not run.
    expect(q.count()).toBe(1);
    expect(q.count('subscription.count')).toBe(0);
    expect(s.get.mock.calls[0][0]).toBe('plan-subscriber-counts');
  });
});
