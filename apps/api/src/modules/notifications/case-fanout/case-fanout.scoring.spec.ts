import {
  FANOUT_WEIGHTS,
  NO_STATS,
  acceptanceScore,
  exposureBonus,
  isNewcomer,
  loadScore,
  rankCandidates,
  scoreCandidate,
  selectWave,
  speedScore,
  type FanoutCandidate,
  type FanoutStats,
  type RankedCandidate,
} from './case-fanout.scoring';

const cand = (
  id: string,
  over: Partial<FanoutCandidate> = {},
): FanoutCandidate => ({
  id,
  exactPractice: true,
  primaryState: true,
  trustLevel: 1,
  ratingAvg: 4.5,
  ratingCount: 20,
  ...over,
});
const stats = (over: Partial<FanoutStats> = {}): FanoutStats => ({
  ...NO_STATS,
  ...over,
});
const RULES = { maxAlerts: 20, maxBids: 3 };

describe('case fan-out scoring', () => {
  it('weights add up to 1', () => {
    const sum = Object.values(FANOUT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('every feature stays in 0..1', () => {
    for (const v of [
      acceptanceScore(0, 0),
      acceptanceScore(50, 50),
      speedScore(null),
      speedScore(0),
      speedScore(500),
      loadScore(0),
      loadScore(100),
      exposureBonus(0, 20),
      exposureBonus(999, 20),
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(exposureBonus(5, 0)).toBe(0);
  });

  it('exact practice, trust, rating and speed raise the score', () => {
    const base = scoreCandidate(cand('a'), stats());
    expect(
      scoreCandidate(cand('a', { exactPractice: false }), stats()),
    ).toBeLessThan(base);
    expect(
      scoreCandidate(cand('a', { trustLevel: 3 }), stats()),
    ).toBeGreaterThan(base);
    expect(
      scoreCandidate(cand('a', { ratingAvg: 3, ratingCount: 30 }), stats()),
    ).toBeLessThan(base);
    expect(
      scoreCandidate(cand('a'), stats({ avgBidHours: 0.5 })),
    ).toBeGreaterThan(scoreCandidate(cand('a'), stats({ avgBidHours: 48 })));
  });

  it('one perfect review does not beat many good ones', () => {
    const one = scoreCandidate(
      cand('a', { ratingAvg: 5, ratingCount: 1 }),
      stats(),
    );
    const many = scoreCandidate(
      cand('b', { ratingAvg: 4.8, ratingCount: 80 }),
      stats(),
    );
    expect(many).toBeGreaterThan(one);
  });

  it('recent load lowers the score (no flooding the same people)', () => {
    expect(scoreCandidate(cand('a'), stats({ alerts24h: 8 }))).toBeLessThan(
      scoreCandidate(cand('a'), stats({ alerts24h: 0 })),
    );
  });

  it('newcomer = few alerts and few offers; exposure decays by alerts', () => {
    expect(isNewcomer(stats({ alertsTotal: 2, bids: 0 }), RULES)).toBe(true);
    expect(isNewcomer(stats({ alertsTotal: 25, bids: 0 }), RULES)).toBe(false);
    expect(isNewcomer(stats({ alertsTotal: 2, bids: 9 }), RULES)).toBe(false);
    expect(isNewcomer(stats(), { maxAlerts: 0, maxBids: 3 })).toBe(false);
    expect(exposureBonus(0, 20)).toBe(1);
    expect(exposureBonus(10, 20)).toBeCloseTo(0.5, 9);
    expect(exposureBonus(20, 20)).toBe(0);
  });

  it('ranking is best-first and stable per case', () => {
    const cs = [
      cand('a', { trustLevel: 0 }),
      cand('b', { trustLevel: 3 }),
      cand('c'),
    ];
    const r = rankCandidates('case1', cs, new Map(), RULES);
    expect(r[0].id).toBe('b');
    expect(r.map((x) => x.id)).toEqual(
      rankCandidates('case1', cs, new Map(), RULES).map((x) => x.id),
    );
  });
});

describe('selectWave quota', () => {
  const mk = (
    id: string,
    score: number,
    isNew = false,
    exposure = 0,
  ): RankedCandidate => ({
    id,
    score,
    isNew,
    exposure,
  });
  const list = [
    mk('s1', 0.9),
    mk('s2', 0.8),
    mk('s3', 0.7),
    mk('s4', 0.6),
    mk('s5', 0.5),
    mk('n1', 0.2, true, 1),
    mk('n2', 0.1, true, 0.5),
    mk('n3', 0.05, true, 0.9),
  ];

  it('room for all = everybody, in ranked order', () => {
    expect(selectWave(list, 100, 20).map((r) => r.id)).toEqual(
      list.map((r) => r.id),
    );
  });

  it('reserves the quota for the least exposed newcomers', () => {
    const got = selectWave(list, 5, 40).map((r) => r.id);
    expect(got).toHaveLength(5);
    expect(got).toContain('n1');
    expect(got).toContain('n3');
    expect(got).not.toContain('n2');
    expect(got).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
  });

  it('quota 0 = pure score order', () => {
    expect(selectWave(list, 3, 0).map((r) => r.id)).toEqual(['s1', 's2', 's3']);
  });

  it('too few newcomers: the places go to the best of the rest', () => {
    const few = [
      mk('s1', 0.9),
      mk('s2', 0.8),
      mk('s3', 0.7),
      mk('n1', 0.1, true, 1),
    ];
    const got = selectWave(few, 3, 100).map((r) => r.id);
    expect(got).toEqual(['s1', 's2', 'n1']);
  });

  it('never exceeds the size and never repeats a person', () => {
    const got = selectWave(list, 4, 100);
    expect(got).toHaveLength(4);
    expect(new Set(got.map((r) => r.id)).size).toBe(4);
  });
});
