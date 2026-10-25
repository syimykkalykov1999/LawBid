import { hash01 } from '../recommendations/ranking.math';

/**
 * Pure helpers for experiments (owner 2026-10-25, docs/architecture/
 * EXPERIMENTS.md): who gets which variant, and the statistics of the nightly
 * report. No I/O here, so every function is unit-tested on its own.
 */

export interface VariantWeight {
  key: string;
  weight: number;
}

/**
 * Deterministic assignment, the same idea as GrowthBook's SDK (a hash of
 * unit + key mapped to 0..1, then cut by weights): first a traffic gate (a
 * separate salt, so ramping 5% -> 50% keeps everyone already inside), then the
 * variant by cumulative weight. null = not in the experiment.
 */
export function assignVariant(
  unitId: string,
  key: string,
  variants: readonly VariantWeight[],
  trafficPercent: number,
): string | null {
  if (variants.length === 0 || trafficPercent <= 0) return null;
  if (trafficPercent < 100 && hash01(`${key}:traffic:${unitId}`) * 100 >= trafficPercent) {
    return null;
  }
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) return null;
  const u = hash01(`${key}:variant:${unitId}`) * total;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (u < acc) return v.key;
  }
  return variants[variants.length - 1].key;
}

/** Percentage rollout of a feature flag for one user (same hash). */
export function inRollout(
  flagKey: string,
  userId: string,
  percent: number,
): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  return hash01(`flag:${flagKey}:${userId}`) * 100 < percent;
}

/** Impressions/clicks are kept for this share of users (same user always in or out). */
export function inImpressionSample(userId: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  return hash01(`rank-sample:${userId}`) * 100 < percent;
}

// ---- distributions ------------------------------------------------------

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf, |err| < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function logGamma(z: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = z;
  let tmp = z + 5.5;
  tmp -= (z + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / z);
}

/** Regularised lower incomplete gamma P(a, x). */
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** P(X >= x) for a chi-square variable with [df] degrees of freedom. */
export function chiSquareSurvival(x: number, df: number): number {
  if (x <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - gammaP(df / 2, x / 2)));
}

// ---- sample ratio mismatch ---------------------------------------------

export interface SrmResult {
  /** Probability of a split this uneven (or worse) if assignment were fair. */
  p: number;
  flag: boolean;
  total: number;
}

/** A p below this means the split is broken (the usual SRM alarm level). */
export const SRM_P_THRESHOLD = 0.001;

/** Chi-square goodness of fit of the exposed counts against the weights. */
export function srmCheck(
  observed: Record<string, number>,
  variants: readonly VariantWeight[],
): SrmResult {
  const total = variants.reduce((s, v) => s + (observed[v.key] ?? 0), 0);
  const wTotal = variants.reduce((s, v) => s + v.weight, 0);
  if (total < 100 || wTotal <= 0 || variants.length < 2) {
    return { p: 1, flag: false, total };
  }
  let chi = 0;
  for (const v of variants) {
    const exp = (total * v.weight) / wTotal;
    if (exp <= 0) continue;
    const o = observed[v.key] ?? 0;
    chi += ((o - exp) * (o - exp)) / exp;
  }
  const p = chiSquareSurvival(chi, variants.length - 1);
  return { p, flag: p < SRM_P_THRESHOLD, total };
}

// ---- metrics ------------------------------------------------------------

export interface Interval {
  /** Point estimate. */
  value: number;
  low: number;
  high: number;
  /** Subjects (users / cases) behind the number. */
  n: number;
}

/** z for a two-sided 95% interval. */
export const Z95 = 1.959964;

/** Sufficient statistics of per-subject (x, y) pairs for a ratio y/x. */
export interface RatioStats {
  n: number;
  sx: number;
  sy: number;
  sxx: number;
  syy: number;
  sxy: number;
}

/**
 * Ratio of sums (clicks / impressions) over subjects, with a delta-method
 * interval that respects that one user contributes many rows (a plain
 * binomial interval would be far too narrow).
 */
export function ratioInterval(s: RatioStats, z = Z95): Interval {
  if (s.n < 2 || s.sx <= 0) return { value: 0, low: 0, high: 0, n: s.n };
  const mx = s.sx / s.n;
  const r = s.sy / s.sx;
  const varX = (s.sxx - s.n * mx * mx) / (s.n - 1);
  const my = s.sy / s.n;
  const varY = (s.syy - s.n * my * my) / (s.n - 1);
  const cov = (s.sxy - s.n * mx * my) / (s.n - 1);
  const v = Math.max(0, varY + r * r * varX - 2 * r * cov) / (s.n * mx * mx);
  const se = Math.sqrt(v);
  return { value: r, low: Math.max(0, r - z * se), high: r + z * se, n: s.n };
}

/** Wilson interval for a share (successes / n). */
export function wilsonInterval(successes: number, n: number, z = Z95): Interval {
  if (n <= 0) return { value: 0, low: 0, high: 0, n: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { value: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half), n };
}

/** Mean with a normal interval, from n, sum and sum of squares. */
export function meanInterval(n: number, sum: number, sumSq: number, z = Z95): Interval {
  if (n < 2) return { value: n === 1 ? sum : 0, low: 0, high: 0, n };
  const m = sum / n;
  const variance = Math.max(0, (sumSq - n * m * m) / (n - 1));
  const se = Math.sqrt(variance / n);
  return { value: m, low: m - z * se, high: m + z * se, n };
}

export interface Difference {
  /** treatment - control, absolute. */
  diff: number;
  low: number;
  high: number;
  /** (treatment - control) / control; null when control is 0. */
  relative: number | null;
  /** Two-sided p-value of "no difference". */
  p: number;
}

/** Difference of two independent estimates from their intervals (z-based). */
export function differenceOf(
  control: Interval,
  treatment: Interval,
  z = Z95,
): Difference {
  const seC = (control.high - control.low) / (2 * Z95);
  const seT = (treatment.high - treatment.low) / (2 * Z95);
  const se = Math.sqrt(seC * seC + seT * seT);
  const diff = treatment.value - control.value;
  const p = se > 0 ? 2 * (1 - normalCdf(Math.abs(diff) / se)) : 1;
  return {
    diff,
    low: diff - z * se,
    high: diff + z * se,
    relative: control.value > 0 ? diff / control.value : null,
    p,
  };
}

// ---- ranking quality ----------------------------------------------------

/** NDCG@k of a list of graded relevances in the order shown. */
export function ndcgAtK(relevances: readonly number[], k: number): number {
  const dcg = (rs: readonly number[]) =>
    rs.slice(0, k).reduce((s, r, i) => s + (Math.pow(2, r) - 1) / Math.log2(i + 2), 0);
  const ideal = [...relevances].sort((a, b) => b - a);
  const best = dcg(ideal);
  return best > 0 ? dcg(relevances) / best : 0;
}
