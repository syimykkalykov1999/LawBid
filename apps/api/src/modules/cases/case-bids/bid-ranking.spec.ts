import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import {
  afterScoreCursor,
  bestMatchScore,
  isSuspiciouslyLow,
  median,
  priceContext,
  priceFit,
  ratingScore,
  sortByScore,
  type RankBid,
  type RankSettings,
} from './bid-ranking';

const S: RankSettings = {
  weights: {
    rating: APP_SETTINGS['bids.best_match.rating'],
    trust: APP_SETTINGS['bids.best_match.trust'],
    speed: APP_SETTINGS['bids.best_match.speed'],
    price: APP_SETTINGS['bids.best_match.price'],
    completed: APP_SETTINGS['bids.best_match.completed'],
  },
  bayesPrior: APP_SETTINGS['bids.bayes_prior'],
  bayesWeight: APP_SETTINGS['bids.bayes_weight'],
  lowRatio: APP_SETTINGS['bids.low_ratio'],
  minBidsForPrice: APP_SETTINGS['bids.min_bids_for_price'],
};

const HOUR = 3600 * 1000;
const bid = (id: string, o: Partial<RankBid> = {}): RankBid => ({
  id,
  feeType: 'fixed',
  amountCents: 100_000,
  percentBps: null,
  status: 'active',
  createdAtMs: 5 * HOUR,
  ratingAvg: 4.5,
  ratingCount: 10,
  trustLevel: 1,
  completedCases: 0,
  ...o,
});

describe('bayesian rating', () => {
  it('one 5.0 review does not beat 80 reviews of 4.8', () => {
    const one = ratingScore(bid('a', { ratingAvg: 5, ratingCount: 1 }), S);
    const many = ratingScore(bid('b', { ratingAvg: 4.8, ratingCount: 80 }), S);
    expect(many).toBeGreaterThan(one);
  });
  it('no reviews sits at the prior, not at zero', () => {
    const none = ratingScore(bid('a', { ratingAvg: 0, ratingCount: 0 }), S);
    expect(none).toBeCloseTo(0.8, 5);
  });
});

describe('priceContext', () => {
  it('median handles empty, odd and even', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
  it('no median / best price below the minimum number of bids', () => {
    const ctx = priceContext([bid('a'), bid('b')], S);
    expect(ctx.bestPriceId).toBeNull();
    expect(ctx.medians.size).toBe(0);
  });
  it('best price skips a suspiciously low bid', () => {
    const bids = [
      bid('a', { amountCents: 100_000 }),
      bid('b', { amountCents: 110_000 }),
      bid('c', { amountCents: 90_000 }),
      bid('d', { amountCents: 5_000 }),
    ];
    const ctx = priceContext(bids, S);
    expect(ctx.bestPriceId).toBe('c');
    expect(isSuspiciouslyLow(bids[3], ctx, S)).toBe(true);
    expect(isSuspiciouslyLow(bids[2], ctx, S)).toBe(false);
  });
  it('withdrawn bids and free consultations do not count', () => {
    const bids = [
      bid('a', { amountCents: 100_000 }),
      bid('b', { amountCents: 120_000 }),
      bid('c', { amountCents: 110_000 }),
      bid('w', { amountCents: 90_000, status: 'withdrawn' }),
      bid('f', { feeType: 'free_consultation', amountCents: 0 }),
    ];
    expect(priceContext(bids, S).bestPriceId).toBe('a');
  });
  it('contingency compares percent, not money', () => {
    const bids = [
      bid('a', { feeType: 'contingency', amountCents: 0, percentBps: 3300 }),
      bid('b', { feeType: 'contingency', amountCents: 0, percentBps: 2500 }),
      bid('c', { feeType: 'contingency', amountCents: 0, percentBps: 3000 }),
    ];
    expect(priceContext(bids, S).bestPriceId).toBe('b');
  });
  it('a lower id wins an equal price', () => {
    const bids = [bid('b'), bid('a'), bid('c')];
    expect(priceContext(bids, S).bestPriceId).toBe('a');
  });
});

describe('best match', () => {
  const group = [bid('x'), bid('y'), bid('z')];
  const ctx = priceContext(group, S);
  const score = (b: RankBid) => bestMatchScore(b, 0, ctx, S);

  it('is within 0..1 and never rewards dumping', () => {
    const cheap = bid('d', { amountCents: 1_000 });
    const ctx2 = priceContext([...group, cheap], S);
    expect(priceFit(cheap, ctx2, S)).toBe(0.5);
    const s = bestMatchScore(cheap, 0, ctx2, S);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
  it('better reviews, trust, speed and completed cases rank higher', () => {
    const base = score(bid('a'));
    expect(
      score(bid('a', { ratingAvg: 4.9, ratingCount: 60 })),
    ).toBeGreaterThan(base);
    expect(score(bid('a', { trustLevel: 3 }))).toBeGreaterThan(base);
    expect(score(bid('a', { createdAtMs: HOUR }))).toBeGreaterThan(base);
    expect(score(bid('a', { completedCases: 12 }))).toBeGreaterThan(base);
  });
  it('a cheaper (reasonable) bid beats a pricier one, all else equal', () => {
    expect(score(bid('a', { amountCents: 80_000 }))).toBeGreaterThan(
      score(bid('a', { amountCents: 130_000 })),
    );
  });
  it('all weights zero gives 0 instead of NaN', () => {
    const z = {
      ...S,
      weights: { rating: 0, trust: 0, speed: 0, price: 0, completed: 0 },
    };
    expect(bestMatchScore(bid('a'), 0, ctx, z)).toBe(0);
  });
  it('a bid placed before the case existed counts as instant', () => {
    expect(
      bestMatchScore(bid('a', { createdAtMs: 0 }), 10 * HOUR, ctx, S),
    ).toBe(
      bestMatchScore(bid('a', { createdAtMs: 10 * HOUR }), 10 * HOUR, ctx, S),
    );
  });
  it('default weights are positive', () => {
    for (const v of Object.values(S.weights)) expect(v).toBeGreaterThan(0);
  });
});

describe('score ordering and keyset', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const sc: Record<string, number> = { a: 0.5, b: 0.9, c: 0.5, d: 0.1 };
  const f = (r: { id: string }) => sc[r.id];

  it('sorts by score desc, ties by id desc', () => {
    expect(sortByScore(rows, f).map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('pages without gaps or repeats over ties', () => {
    const sorted = sortByScore(rows, f);
    expect(afterScoreCursor(sorted, f, 0.5, 'c').map((r) => r.id)).toEqual([
      'a',
      'd',
    ]);
    expect(afterScoreCursor(sorted, f, 0.1, 'd')).toEqual([]);
  });
});
