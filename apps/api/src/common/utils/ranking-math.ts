/** Small pure helpers shared by the recommendation scorers. */

export const clamp01 = (x: number): number =>
  Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;

/** 1 − e^(−x/k): 0 at 0, → 1 as x grows; [k] is the "enough" scale. */
export const saturate = (x: number, k: number): number =>
  x <= 0 ? 0 : 1 - Math.exp(-x / k);

/** e^(−age/scale): 1 now, ~0.37 after one [scale]. */
export const decay = (ageMs: number, scaleMs: number): number =>
  Math.exp(-Math.max(0, ageMs) / scaleMs);

export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Rating shrunk towards a prior so 1 review of 5.0 does not beat 80
 * reviews of 4.8. Returns 0..1.
 */
export function bayesRating(
  avg: number,
  count: number,
  prior = 4,
  weight = 5,
): number {
  const n = Math.max(0, count);
  const mean = (avg * n + prior * weight) / (n + weight);
  return clamp01(mean / 5);
}

/** log1p(x) / log1p(cap), capped at 1: a log scale that tops out at [cap]. */
export const logScale = (x: number, cap: number): number =>
  clamp01(Math.log1p(Math.max(0, x)) / Math.log1p(cap));

/** Stable 0..1 hash of a string (FNV-1a): same input, same value. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

/** UTC day number: a seed that rotates "exploration" once a day. */
export const dayNumber = (now: number): number => Math.floor(now / DAY_MS);

/**
 * Weighted sum of 0..1 features. Weights must add up to 1 (checked by the
 * specs), so a score is always a 0..1 number.
 */
export function weighted<K extends string>(
  weights: Record<K, number>,
  features: Record<K, number>,
): number {
  let s = 0;
  for (const k of Object.keys(weights) as K[]) {
    s += weights[k] * clamp01(features[k]);
  }
  return s;
}

export interface Scored<T> {
  item: T;
  score: number;
}

/**
 * Greedy re-ranking for variety: at each step the best remaining item
 * after penalties — [keyPenalty] for an item whose key appeared among the
 * last [window] picked, [runPenalty] when the last two picked share its
 * kind. Order inside equal scores is kept (stable).
 */
export function diversify<T>(
  scored: Scored<T>[],
  opts: {
    key: (t: T) => string;
    kind?: (t: T) => string;
    window?: number;
    keyPenalty?: number;
    runPenalty?: number;
  },
): T[] {
  const window = opts.window ?? 6;
  const keyPenalty = opts.keyPenalty ?? 0.25;
  const runPenalty = opts.runPenalty ?? 0.1;
  const left = [...scored].sort((a, b) => b.score - a.score);
  const out: T[] = [];
  while (left.length > 0) {
    const recent = out.slice(-window).map(opts.key);
    const kinds = opts.kind ? out.slice(-2).map(opts.kind) : [];
    let best = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < left.length; i++) {
      const t = left[i].item;
      let v = left[i].score;
      if (recent.includes(opts.key(t))) v -= keyPenalty;
      if (
        opts.kind &&
        kinds.length === 2 &&
        kinds[0] === kinds[1] &&
        kinds[0] === opts.kind(t)
      ) {
        v -= runPenalty;
      }
      // Only the head of a sorted list can win by more than the penalties.
      if (v > bestValue) {
        bestValue = v;
        best = i;
      }
      if (left[i].score + 1e-9 < bestValue) break;
    }
    out.push(left.splice(best, 1)[0].item);
  }
  return out;
}

/**
 * Secondary sort for text search: [items] arrive in text-relevance order;
 * inside each run of the same [tier] they are cut into chunks of [chunk]
 * neighbours and each chunk is ordered by personal [affinity] (stable on
 * ties). Tiers and the coarse text order never change: a person can move
 * at most [chunk]−1 places, and never past a better text match tier.
 */
export function reorderWithinTiers<T>(
  items: T[],
  tier: (t: T) => number,
  affinity: (t: T) => number,
  chunk = 5,
): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j < items.length && tier(items[j]) === tier(items[i])) j++;
    for (let k = i; k < j; k += chunk) {
      const part = items.slice(k, Math.min(j, k + chunk));
      out.push(
        ...part
          .map((t, idx) => ({ t, idx, a: affinity(t) }))
          .sort((x, y) => y.a - x.a || x.idx - y.idx)
          .map((x) => x.t),
      );
    }
    i = j;
  }
  return out;
}
