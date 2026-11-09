import { ExperimentsService } from './experiments.service';

function build(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    experiment: { findMany },
    experimentExposure: { createMany },
  };
  return { svc: new ExperimentsService(prisma as never), findMany, createMany };
}

const running = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  key: 'case_feed_v2',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'new_formula', weight: 50 },
  ],
  traffic_percent: 100,
  start_at: null,
  end_at: null,
  ...over,
});

describe('ExperimentsService', () => {
  it('returns null for an unknown or not running experiment', async () => {
    const { svc } = build([]);
    expect(await svc.variant('u1', 'nope')).toBeNull();
  });

  it('gives the same variant every time and stores the exposure once', async () => {
    const { svc, createMany } = build([running()]);
    const a = await svc.variant('user-1', 'case_feed_v2');
    expect(['control', 'new_formula']).toContain(a);
    for (let i = 0; i < 4; i++)
      expect(await svc.variant('user-1', 'case_feed_v2')).toBe(a);
    await svc.flushExposures();
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('reads the definitions once for many calls', async () => {
    const { svc, findMany } = build([running()]);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        svc.variant(`u${i}`, 'case_feed_v2'),
      ),
    );
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('gives null before the start and after the end date', async () => {
    const future = build([
      running({ start_at: new Date(Date.now() + 3_600_000) }),
    ]);
    expect(await future.svc.variant('u', 'case_feed_v2')).toBeNull();
    const past = build([running({ end_at: new Date(Date.now() - 1000) })]);
    expect(await past.svc.variant('u', 'case_feed_v2')).toBeNull();
  });

  it('after invalidate a stop applies at once', async () => {
    const { svc, findMany } = build([running()]);
    expect(await svc.variant('user-9', 'case_feed_v2')).not.toBeNull();
    findMany.mockResolvedValue([]);
    svc.invalidate();
    expect(await svc.variant('user-9', 'case_feed_v2')).toBeNull();
  });

  it('never throws: a database error means the default behaviour', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const svc = new ExperimentsService({
      experiment: { findMany },
      experimentExposure: { createMany: jest.fn() },
    } as never);
    expect(await svc.variant('u', 'case_feed_v2')).toBeNull();
  });

  it('keeps serving the last known definitions when the refresh fails', async () => {
    const { svc, findMany } = build([running()]);
    const first = await svc.variant('user-5', 'case_feed_v2');
    findMany.mockRejectedValue(new Error('db down'));
    // Force a refresh by expiring the cache.
    (svc as unknown as { defs: { at: number } }).defs.at = 0;
    expect(await svc.variant('user-5', 'case_feed_v2')).toBe(first);
  });

  it('puts about the configured share of units inside', async () => {
    const { svc } = build([running({ traffic_percent: 10 })]);
    let inside = 0;
    for (let i = 0; i < 5000; i++) {
      if ((await svc.variant(`unit-${i}`, 'case_feed_v2')) !== null) inside++;
    }
    expect(inside / 5000).toBeGreaterThan(0.08);
    expect(inside / 5000).toBeLessThan(0.12);
  });

  // Owner 2026-11-08: the ranking code asks by surface, not by key.
  describe('assignSurface / assignAll', () => {
    const withWeights = (over: Record<string, unknown> = {}) =>
      running({
        surface: 'case_feed',
        variants: [
          { key: 'control', weight: 50 },
          { key: 'new_formula', weight: 50, weights: { urgency: 0.9 } },
        ],
        ...over,
      });

    it('finds the running test of the surface and carries the variant weights', async () => {
      const { svc } = build([withWeights()]);
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const a = await svc.assignSurface(`u${i}`, 'case_feed');
        expect(a?.experimentKey).toBe('case_feed_v2');
        seen.add(a!.variant);
        if (a!.variant === 'new_formula') {
          expect(a!.weights).toEqual({ urgency: 0.9 });
        } else {
          expect(a!.weights).toBeUndefined();
        }
        // Stable for the same unit.
        expect((await svc.assignSurface(`u${i}`, 'case_feed'))?.variant).toBe(
          a!.variant,
        );
      }
      expect(seen).toEqual(new Set(['control', 'new_formula']));
      expect(await svc.assignSurface('u1', 'people')).toBeNull();
    });

    it('an action tag (expose: false) records no exposure', async () => {
      const { svc, createMany } = build([withWeights()]);
      const tags = await svc.assignAll('user-9', { expose: false });
      expect(tags).toHaveLength(1);
      await svc.flushExposures();
      expect(createMany).not.toHaveBeenCalled();
      await svc.assignSurface('user-9', 'case_feed');
      await svc.flushExposures();
      expect(createMany).toHaveBeenCalledTimes(1);
    });

    it('control never applies weights, whatever is stored', async () => {
      const { svc } = build([
        withWeights({
          variants: [
            { key: 'control', weight: 100, weights: { urgency: 1 } },
            { key: 'x', weight: 0 },
          ],
        }),
      ]);
      const a = await svc.assignSurface('u1', 'case_feed');
      expect(a?.variant).toBe('control');
      expect(a?.weights).toBeUndefined();
    });
  });
});
