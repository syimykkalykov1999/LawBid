import {
  HOTLINE_STATS_DAYS,
  HOTLINE_STATS_KEY,
  HotlineStatsService,
  mergeDays,
  mergeRows,
} from './hotline-stats.service';

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);

describe('HotlineStatsService (admin: nightly snapshot, owner rule)', () => {
  it('every day of the 30 shows, empty ones as zeros, oldest first', () => {
    const days = mergeDays(
      [
        [
          {
            day: new Date(Date.UTC(2026, 10, 24)),
            calls: 3n,
            talk: 600n,
            cases: 1n,
            reviews: 2n,
            stars: 9n,
            clients: 3n,
            attorneys: 2n,
          },
        ],
        // a second database, same day: added up
        [
          {
            day: new Date(Date.UTC(2026, 10, 24)),
            calls: 1,
            talk: null,
            cases: 0,
            reviews: 0,
            stars: null,
            clients: 1,
            attorneys: 1,
          },
        ],
      ],
      NOW,
    );
    expect(days).toHaveLength(HOTLINE_STATS_DAYS);
    expect(days[0].day).toBe('2026-10-26');
    expect(days.at(-1)).toEqual({
      day: '2026-11-24',
      calls: 4,
      talkSeconds: 600,
      casesOffered: 1,
      reviews: 2,
      starsSum: 9,
      clients: 4,
      attorneys: 3,
    });
    expect(days[5].calls).toBe(0);
  });

  it('a day outside the window is never counted', () => {
    const days = mergeDays(
      [
        [
          {
            day: new Date(Date.UTC(2026, 8, 1)),
            calls: 99,
            talk: 1,
            cases: 0,
            reviews: 0,
            stars: 0,
            clients: 1,
            attorneys: 1,
          },
        ],
      ],
      NOW,
    );
    expect(days.reduce((n, d) => n + d.calls, 0)).toBe(0);
  });

  it('states / practices / reasons summed over databases, most first', () => {
    expect(
      mergeRows([
        [
          { key: 'CA', n: 2n },
          { key: 'NV', n: 5n },
        ],
        [
          { key: 'CA', n: 4 },
          { key: null, n: 1 },
        ],
      ]),
    ).toEqual([
      { key: 'CA', calls: 6 },
      { key: 'NV', calls: 5 },
      { key: '—', calls: 1 },
    ]);
  });

  it('the page reads the stored copy; nothing stored → counted once', async () => {
    const raw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: raw };
    const stored = {
      data: { computedAt: 'x', days: [] },
      computedAt: new Date().toISOString(),
    };
    const summary = {
      peek: jest.fn().mockResolvedValue(stored),
      refresh: jest.fn(),
    };
    const svc = new HotlineStatsService(prisma as never, summary as never);
    await expect(svc.stats()).resolves.toBe(stored.data);
    expect(raw).not.toHaveBeenCalled();
    expect(summary.peek).toHaveBeenCalledWith(HOTLINE_STATS_KEY);

    summary.peek.mockResolvedValue(null);
    summary.refresh.mockImplementation(
      async (_k: string, fn: () => Promise<unknown>) => ({ data: await fn() }),
    );
    const fresh = await svc.stats();
    expect(fresh.days).toHaveLength(HOTLINE_STATS_DAYS);
    // one grouped query per question: days, states, practices, reasons
    expect(raw).toHaveBeenCalledTimes(4);
  });

  it('the daily run recounts only when the snapshot is due', async () => {
    const summary = {
      peek: jest.fn().mockResolvedValue({
        data: {},
        computedAt: new Date(Date.now() - 60_000).toISOString(),
      }),
      refresh: jest.fn().mockResolvedValue({ data: {} }),
    };
    const svc = new HotlineStatsService(
      { $queryRaw: jest.fn() } as never,
      summary as never,
    );
    await svc.refreshDaily();
    expect(summary.refresh).not.toHaveBeenCalled();
    summary.peek.mockResolvedValue({
      data: {},
      computedAt: new Date(Date.now() - 27 * 3_600_000).toISOString(),
    });
    await svc.refreshDaily();
    expect(summary.refresh).toHaveBeenCalledTimes(1);
  });
});
