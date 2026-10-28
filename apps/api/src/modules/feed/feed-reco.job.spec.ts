import { FeedRecoJob, RECO_TOP_N, exploreScores } from './feed-reco.job';

/** Algo audit 2026-10-27 (CONTENT H-5): exploration slots in the snapshot. */
function setup(opts: {
  ranked: { id: string; score: number }[];
  fresh?: { id: string }[];
  stored?: Record<string, number>;
}) {
  const queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('like_count = 0')) {
      return Promise.resolve(opts.fresh ?? []);
    }
    return Promise.resolve(opts.ranked);
  });
  const zadd = jest.fn();
  const multi = {
    zadd,
    expire: jest.fn(),
    set: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  };
  const redis = { multi: jest.fn(() => multi) };
  const logger = { setContext: jest.fn(), info: jest.fn() };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(
        opts.stored?.[k] ??
          (k === 'feed.reco_explore_slots'
            ? 100
            : k === 'feed.reco_explore_hours'
              ? 6
              : 0),
      ),
    ),
  };
  const job = new FeedRecoJob(
    { $queryRaw: queryRaw } as never,
    redis as never,
    logger as never,
    settings as never,
  );
  /** id → score written to the snapshot. */
  const written = (): Map<string, number> => {
    const args = zadd.mock.calls[0] as unknown[];
    const out = new Map<string, number>();
    for (let i = 1; i < args.length; i += 2) {
      out.set(args[i + 1] as string, args[i] as number);
    }
    return out;
  };
  return { job, queryRaw, written };
}

const ranked = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, score: 1000 - i }));

describe('FeedRecoJob exploration (CONTENT H-5)', () => {
  it('a full ranking keeps slots for fresh posts with no reactions', async () => {
    const { job, written } = setup({
      ranked: ranked(RECO_TOP_N),
      fresh: [{ id: 'new1' }, { id: 'new2' }],
    });
    const res = await job.run(new Date('2026-10-28T12:00:00Z'));
    const w = written();
    expect(w.has('new1')).toBe(true);
    expect(w.has('new2')).toBe(true);
    expect(res.posts).toBe(RECO_TOP_N);
    // Spread through the ranking, not parked at the bottom.
    const scores = [...w.values()].sort((a, b) => b - a);
    const rank = scores.indexOf(w.get('new1')!);
    expect(rank).toBeGreaterThan(0);
    expect(rank).toBeLessThan(RECO_TOP_N - 10);
  });

  it('slots unused by fresh posts go back to the ranked rows', async () => {
    const { job, written } = setup({
      ranked: ranked(RECO_TOP_N),
      fresh: [{ id: 'new1' }],
    });
    await job.run();
    const w = written();
    expect(w.size).toBe(RECO_TOP_N);
    expect(w.has(`r${RECO_TOP_N - 2}`)).toBe(true);
  });

  it('0 slots = the old pure score order (no extra query)', async () => {
    const { job, queryRaw, written } = setup({
      ranked: ranked(10),
      fresh: [{ id: 'new1' }],
      stored: { 'feed.reco_explore_slots': 0 },
    });
    await job.run();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(written().has('new1')).toBe(false);
  });
});

describe('exploreScores', () => {
  it('spreads n posts evenly, just under the row they sit next to', () => {
    const s = exploreScores([10, 8, 6, 4, 2], 1);
    expect(s).toHaveLength(1);
    expect(s[0]).toBeLessThan(6);
    expect(s[0]).toBeGreaterThan(4);
  });
  it('no ranked rows → score 0; n = 0 → nothing', () => {
    expect(exploreScores([], 2)).toEqual([0, 0]);
    expect(exploreScores([1], 0)).toEqual([]);
  });
});
