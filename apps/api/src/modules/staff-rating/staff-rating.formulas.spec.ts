import {
  HANDLE_BUCKETS,
  bucketOf,
  computeRating,
  deriveStatus,
  emptyTotals,
  isGreen,
  median,
  percentileFromBuckets,
  planSuggestions,
  rankPct,
  type RatingConfig,
  type WindowTotals,
} from './staff-rating.formulas';

const CFG: RatingConfig = {
  minDecisions: 30,
  weights: { accuracy: 50, clean: 25, users: 15, speed: 10 },
  norm: 85,
  yellowBelow: 75,
  redBelow: 60,
  greenTopPct: 5,
  yellowComplaintsPerWeek: 2,
  redOverturnedInRow: 3,
};

const totals = (o: Partial<WindowTotals>): WindowTotals => ({
  ...emptyTotals(),
  ...o,
});

describe('handling-time buckets', () => {
  it('puts a time in the bucket under its upper edge', () => {
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(4_999)).toBe(0);
    expect(bucketOf(5_000)).toBe(1);
    expect(bucketOf(59_000)).toBe(3);
    expect(bucketOf(10 * 60_000)).toBe(HANDLE_BUCKETS - 2);
    expect(bucketOf(20 * 60_000)).toBe(HANDLE_BUCKETS - 1);
  });

  it('estimates a percentile from the counts', () => {
    // 9 fast (<5 s), 1 slow (<900 s .. open): p90 is still the fast bucket.
    const b = Array(HANDLE_BUCKETS).fill(0);
    b[0] = 9;
    b[7] = 1;
    expect(percentileFromBuckets(b, 0.9)).toBe(5);
    expect(percentileFromBuckets(b, 1)).toBe(1800);
    expect(percentileFromBuckets(Array(HANDLE_BUCKETS).fill(0), 0.9)).toBe(0);
  });

  it('median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('computeRating (window 30 days, plan D2)', () => {
  it('under the minimum of decisions: «мало данных», no number', () => {
    const r = computeRating(totals({ decided: 29, sampled: 5 }), CFG);
    expect(r.lowData).toBe(true);
    expect(r.rating).toBeNull();
  });

  it('exactly the minimum is enough', () => {
    const r = computeRating(totals({ decided: 30 }), CFG);
    expect(r.lowData).toBe(false);
    expect(r.rating).not.toBeNull();
  });

  it('uses the 50/25/15/10 weights when every signal exists', () => {
    const r = computeRating(
      totals({
        decided: 100,
        sampled: 10,
        sampleDiff: 2, // accuracy 80
        reopened: 5,
        complaints: 5, // clean 90
        csatUp: 6,
        csatDown: 4, // users 60
        lateSla: 20, // speed 80
      }),
      CFG,
    );
    expect([r.accuracy, r.clean, r.users, r.speed]).toEqual([80, 90, 60, 80]);
    // 0.5*80 + 0.25*90 + 0.15*60 + 0.10*80 = 40 + 22.5 + 9 + 8 = 79.5
    expect(r.rating).toBe(80);
  });

  it('shares the weight of a missing signal among the others', () => {
    // No re-checks and no user votes: only clean (25) and speed (10) remain.
    const r = computeRating(
      totals({ decided: 100, reopened: 10, lateSla: 0 }),
      CFG,
    );
    expect(r.accuracy).toBeNull();
    expect(r.users).toBeNull();
    // clean 90, speed 100 -> (90*25 + 100*10) / 35 = 92.86
    expect(r.rating).toBe(93);
  });

  it('golden tasks count as re-checks for accuracy', () => {
    const r = computeRating(
      totals({ decided: 40, goldenTotal: 2, goldenFail: 1 }),
      CFG,
    );
    expect(r.accuracy).toBe(50);
  });

  it('never leaves 0-100', () => {
    const r = computeRating(
      totals({ decided: 30, reopened: 100, sampled: 1, sampleDiff: 9 }),
      CFG,
    );
    expect(r.clean).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.rating).toBeGreaterThanOrEqual(0);
  });
});

describe('deriveStatus: thresholds 85 / 75 / 60', () => {
  const rate = (rating: number | null, lowData = false) => ({
    rating,
    lowData,
    accuracy: null,
    clean: null,
    users: null,
    speed: null,
  });
  const base = {
    complaintsWeek: 0,
    overturnedWeek: 0,
    goldenFail: 0,
    rushing: false,
  };

  it.each([
    [90, 'ok'],
    [75, 'ok'],
    [74, 'yellow'],
    [60, 'yellow'],
    [59, 'red'],
  ])('rating %i is %s', (rating, status) => {
    expect(deriveStatus({ ...base, rating: rate(rating) }, CFG).status).toBe(
      status,
    );
  });

  it('two complaints in a week or a failed golden task turn yellow', () => {
    expect(
      deriveStatus({ ...base, rating: rate(90), complaintsWeek: 2 }, CFG),
    ).toEqual({ status: 'yellow', flags: ['complaints_week'] });
    expect(
      deriveStatus({ ...base, rating: rate(90), goldenFail: 1 }, CFG).status,
    ).toBe('yellow');
  });

  it('three overturned decisions or an obvious hurry turn red', () => {
    expect(
      deriveStatus({ ...base, rating: rate(90), overturnedWeek: 3 }, CFG)
        .status,
    ).toBe('red');
    expect(
      deriveStatus({ ...base, rating: rate(90), rushing: true }, CFG).status,
    ).toBe('red');
  });

  it('low data wins over a colour but the flags are kept', () => {
    const r = deriveStatus(
      { ...base, rating: rate(null, true), overturnedWeek: 4 },
      CFG,
    );
    expect(r.status).toBe('low_data');
    expect(r.flags).toEqual(['overturned_streak']);
  });
});

describe('top 5% («лучшие»)', () => {
  it('ranks by place among the peers, ties share the better place', () => {
    const peers = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(rankPct(peers, 100)).toBe(5);
    expect(rankPct(peers, 99)).toBe(10);
    expect(rankPct([80, 80, 80], 80)).toBe(34);
    expect(rankPct([], 80)).toBeNull();
  });

  it('green needs: ok status, rating at the norm, and the top percent', () => {
    expect(isGreen('ok', 95, 5, CFG)).toBe(true);
    expect(isGreen('ok', 95, 6, CFG)).toBe(false);
    expect(isGreen('ok', 84, 1, CFG)).toBe(false);
    expect(isGreen('yellow', 95, 1, CFG)).toBe(false);
    expect(isGreen('low_data', null, null, CFG)).toBe(false);
  });
});

describe('planSuggestions: the system suggests, a human applies', () => {
  const ctx = (o: object) => ({
    status: 'yellow' as const,
    warningsInWindow: 0,
    daysSinceLastWarning: null,
    openKinds: new Set<string>(),
    warningsForReplace: 3,
    ...o,
  });

  it('nothing for ok and low-data people', () => {
    expect(planSuggestions(ctx({ status: 'ok' }))).toEqual([]);
    expect(planSuggestions(ctx({ status: 'low_data' }))).toEqual([]);
  });

  it('yellow: a warning and more re-checks; red adds «снять с очереди»', () => {
    expect(planSuggestions(ctx({}))).toEqual(['warn', 'more_review']);
    expect(planSuggestions(ctx({ status: 'red' }))).toEqual([
      'warn',
      'more_review',
      'pull',
    ]);
  });

  it('one warning per episode: none again within the cooldown', () => {
    expect(
      planSuggestions(ctx({ daysSinceLastWarning: 3, warningsInWindow: 1 })),
    ).toEqual(['more_review']);
    expect(
      planSuggestions(ctx({ daysSinceLastWarning: 7, warningsInWindow: 1 })),
    ).toContain('warn');
  });

  it('three warnings in 60 days → replace (counting the one being written)', () => {
    expect(
      planSuggestions(ctx({ warningsInWindow: 2, daysSinceLastWarning: 10 })),
    ).toEqual(['warn', 'more_review', 'replace']);
    expect(planSuggestions(ctx({ warningsInWindow: 1 }))).not.toContain(
      'replace',
    );
    // Already three warnings, the newest is fresh: replace still stands.
    expect(
      planSuggestions(ctx({ warningsInWindow: 3, daysSinceLastWarning: 2 })),
    ).toContain('replace');
  });

  it('does not repeat a suggestion that is already open', () => {
    const open = new Set(['warn', 'more_review', 'pull', 'replace']);
    expect(
      planSuggestions(
        ctx({ status: 'red', openKinds: open, warningsInWindow: 3 }),
      ),
    ).toEqual([]);
  });

  it('green → a reward, once', () => {
    expect(planSuggestions(ctx({ status: 'green' }))).toEqual(['reward']);
    expect(
      planSuggestions(ctx({ status: 'green', openKinds: new Set(['reward']) })),
    ).toEqual([]);
  });

  it('never proposes anything outside the human-applied kinds', () => {
    const all = planSuggestions(
      ctx({ status: 'red', warningsInWindow: 5, daysSinceLastWarning: 30 }),
    );
    expect(
      all.every((k) =>
        ['warn', 'more_review', 'pull', 'replace', 'reward'].includes(k),
      ),
    ).toBe(true);
  });
});
