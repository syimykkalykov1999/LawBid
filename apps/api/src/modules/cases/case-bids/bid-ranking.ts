import {
  bayesRating,
  clamp01,
  decay,
  HOUR_MS,
  logScale,
} from '../../recommendations/ranking.math';

/**
 * Owner 2026-10-25: how the client's bid list is ranked.
 *
 * Research (2025-2026): marketplaces do not sort offers by the raw star
 * average. Upwork's and Thumbtack's public help pages describe a mix of
 * reviews, response speed, profile trust and price fit; the standard way
 * to compare ratings with different numbers of reviews is a Bayesian
 * (shrunk) average, so 1 review of 5.0 does not beat 80 reviews of 4.8.
 * Sources are listed in the PR.
 */

/** Admin-tunable weights of the "best match" score; need not sum to 1. */
export interface BestMatchWeights {
  rating: number;
  trust: number;
  speed: number;
  price: number;
  completed: number;
}

export interface RankBid {
  id: string;
  feeType: 'fixed' | 'hourly' | 'free_consultation' | 'contingency';
  amountCents: number;
  percentBps: number | null;
  status: string;
  createdAtMs: number;
  ratingAvg: number;
  ratingCount: number;
  trustLevel: number;
  completedCases: number;
}

export interface RankSettings {
  weights: BestMatchWeights;
  bayesPrior: number;
  bayesWeight: number;
  /** A price below this share of the median is "suspiciously low". */
  lowRatio: number;
  /** Bids needed in a fee group before a median / best price exists. */
  minBidsForPrice: number;
}

export interface PriceContext {
  /** Median comparable price per fee type (only groups big enough). */
  medians: Map<string, number>;
  /** Id of the lowest reasonable bid, or null. */
  bestPriceId: string | null;
}

/** The number a bid is compared by: percent for contingency, money else;
 * null when the bid has no comparable price (free consultation, 0). */
export function priceValue(b: RankBid): number | null {
  if (b.feeType === 'free_consultation') return null;
  const v = b.feeType === 'contingency' ? (b.percentBps ?? 0) : b.amountCents;
  return v > 0 ? v : null;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const LIVE = new Set(['active', 'accepted']);

/** Price / median per fee type, and the best-price bid: the lowest price
 * in the biggest fee group that is not below the dumping ratio. */
export function priceContext(bids: RankBid[], s: RankSettings): PriceContext {
  const groups = new Map<string, RankBid[]>();
  for (const b of bids) {
    if (!LIVE.has(b.status) || priceValue(b) === null) continue;
    const g = groups.get(b.feeType) ?? [];
    g.push(b);
    groups.set(b.feeType, g);
  }
  const medians = new Map<string, number>();
  let bestGroup: RankBid[] = [];
  for (const [fee, g] of groups) {
    if (g.length < s.minBidsForPrice) continue;
    const m = median(g.map((b) => priceValue(b) as number));
    if (m === null) continue;
    medians.set(fee, m);
    if (g.length > bestGroup.length) bestGroup = g;
  }
  let best: RankBid | null = null;
  if (bestGroup.length > 0) {
    const m = medians.get(bestGroup[0].feeType) as number;
    for (const b of bestGroup) {
      const v = priceValue(b) as number;
      if (v < m * s.lowRatio) continue;
      const bv = best ? (priceValue(best) as number) : Infinity;
      if (v < bv || (v === bv && best && b.id < best.id)) best = b;
    }
  }
  return { medians, bestPriceId: best?.id ?? null };
}

/** Far below the typical price of its fee type: possible dumping. */
export function isSuspiciouslyLow(
  b: RankBid,
  ctx: PriceContext,
  s: RankSettings,
): boolean {
  const v = priceValue(b);
  const m = ctx.medians.get(b.feeType);
  return v !== null && m !== undefined && v < m * s.lowRatio;
}

/** 0..1 price fit: cheaper than the median is better, but a suspiciously
 * low price is neutral (0.5) so dumping is never rewarded. */
export function priceFit(
  b: RankBid,
  ctx: PriceContext,
  s: RankSettings,
): number {
  const v = priceValue(b);
  const m = ctx.medians.get(b.feeType);
  if (v === null || m === undefined) return 0.5;
  if (isSuspiciouslyLow(b, ctx, s)) return 0.5;
  return clamp01(1.5 - v / m);
}

/** 0..1 bayesian rating of the bid's attorney. */
export function ratingScore(b: RankBid, s: RankSettings): number {
  return bayesRating(b.ratingAvg, b.ratingCount, s.bayesPrior, s.bayesWeight);
}

/** Weighted "best match" score, 0..1; ties are broken by the caller. */
export function bestMatchScore(
  b: RankBid,
  caseCreatedAtMs: number,
  ctx: PriceContext,
  s: RankSettings,
): number {
  const w = s.weights;
  const sum = w.rating + w.trust + w.speed + w.price + w.completed;
  if (!(sum > 0)) return 0;
  const speed = decay(
    Math.max(0, b.createdAtMs - caseCreatedAtMs),
    24 * HOUR_MS,
  );
  const raw =
    w.rating * ratingScore(b, s) +
    w.trust * clamp01(b.trustLevel / 3) +
    w.speed * speed +
    w.price * priceFit(b, ctx, s) +
    w.completed * logScale(b.completedCases, 20);
  // 6 decimals: the score is also the keyset-cursor key.
  return Math.round((raw / sum) * 1e6) / 1e6;
}

/** Descending by score, ties by id descending (matches the keyset). */
export function sortByScore<T extends { id: string }>(
  rows: T[],
  score: (r: T) => number,
): T[] {
  return [...rows].sort(
    (a, b) => score(b) - score(a) || (a.id < b.id ? 1 : -1),
  );
}

/** Rows strictly after the cursor (score, id) in `sortByScore` order. */
export function afterScoreCursor<T extends { id: string }>(
  sorted: T[],
  score: (r: T) => number,
  key: number,
  id: string,
): T[] {
  return sorted.filter((r) => {
    const sc = score(r);
    return sc < key || (sc === key && r.id < id);
  });
}
