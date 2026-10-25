import {
  clamp01,
  decay,
  hash01,
  HOUR_MS,
  saturate,
  weighted,
} from '../../../common/utils/ranking-math';

/**
 * New-case alerts (owner 2026-10-25): who hears about a case first.
 *
 * Pure functions only (no database): the audience query lives in
 * CaseAudienceService, the waves in CaseFanoutService. Patterns taken from
 * lead marketplaces (Thumbtack: preference match first; Bark/Angi: a lead
 * goes to a few pros, not everyone) and from cold-start work in two-sided
 * markets (a reserved share of exposure for new supply, decaying with the
 * exposure already given): see docs/CASE_FANOUT.md.
 */
export const FANOUT_WEIGHTS = {
  /** The case's own practice (not only the parent category / extra topic). */
  practice: 0.22,
  /** Licensed in the case's primary state (not only an extra one). */
  state: 0.1,
  /** Trust level 0..3 (Identity). */
  trust: 0.14,
  /** Rating shrunk to a prior (1 review of 5.0 does not beat 80 of 4.8). */
  rating: 0.16,
  /** How fast they usually bid after a case appears. */
  speed: 0.14,
  /** Share of their offers the client accepted (smoothed). */
  acceptance: 0.1,
  /** Fewer alerts in the last 24 h = higher: do not flood the same people. */
  load: 0.14,
} as const;

export interface FanoutCandidate {
  id: string;
  /** The case's own practice is among the attorney's alert practices. */
  exactPractice: boolean;
  /** Verified licence in the case's primary state. */
  primaryState: boolean;
  trustLevel: number;
  ratingAvg: number;
  ratingCount: number;
}

export interface FanoutStats {
  /** Alerts received in the last 24 h / in the look-back window. */
  alerts24h: number;
  alertsTotal: number;
  /** Offers ever made (look-back), and accepted ones. */
  bids: number;
  accepted: number;
  /** Average hours from a case's creation to this attorney's offer;
   * null = no data (neutral score). */
  avgBidHours: number | null;
}

export const NO_STATS: FanoutStats = {
  alerts24h: 0,
  alertsTotal: 0,
  bids: 0,
  accepted: 0,
  avgBidHours: null,
};

export interface RankedCandidate {
  id: string;
  score: number;
  isNew: boolean;
  /** 0..1, 1 = no alerts received yet; falls as alerts pile up. */
  exposure: number;
}

export interface NewcomerRules {
  /** An attorney with fewer alerts than this (and fewer bids than
   * `maxBids`) is "new": 0 = nobody is new. */
  maxAlerts: number;
  maxBids: number;
}

/** Bayesian-smoothed acceptance, scaled so ~50 % accepted = 1. */
export function acceptanceScore(accepted: number, bids: number): number {
  const prior = 0.2;
  const weight = 5;
  const rate = (accepted + prior * weight) / (Math.max(0, bids) + weight);
  return clamp01(rate / 0.5);
}

/** 1 = bids within the hour, ~0.37 after a day, 0.5 when unknown. */
export function speedScore(avgBidHours: number | null): number {
  if (avgBidHours === null || !Number.isFinite(avgBidHours)) return 0.5;
  return decay(avgBidHours * HOUR_MS, 24 * HOUR_MS);
}

/** 1 with no alerts today, falling towards 0 (half at 3 alerts). */
export function loadScore(alerts24h: number): number {
  return 1 - saturate(alerts24h, 4.3);
}

/** Exposure bonus: 1 for nobody-told-yet, 0 once `maxAlerts` were sent. */
export function exposureBonus(alertsTotal: number, maxAlerts: number): number {
  if (maxAlerts <= 0) return 0;
  return clamp01(1 - Math.max(0, alertsTotal) / maxAlerts);
}

export function isNewcomer(s: FanoutStats, rules: NewcomerRules): boolean {
  return (
    rules.maxAlerts > 0 &&
    s.alertsTotal < rules.maxAlerts &&
    s.bids < rules.maxBids
  );
}

export function scoreCandidate(c: FanoutCandidate, s: FanoutStats): number {
  const rating =
    c.ratingCount > 0
      ? clamp01((c.ratingAvg * c.ratingCount + 4 * 5) / (c.ratingCount + 5) / 5)
      : 0.8;
  return weighted(FANOUT_WEIGHTS, {
    practice: c.exactPractice ? 1 : 0.5,
    state: c.primaryState ? 1 : 0.5,
    trust: c.trustLevel / 3,
    rating,
    speed: speedScore(s.avgBidHours),
    acceptance: acceptanceScore(s.accepted, s.bids),
    load: loadScore(s.alerts24h),
  });
}

/** Score, newcomer flag and exposure of every candidate; best first.
 * Ties are broken by a stable per-case hash, so equals rotate between
 * cases instead of always favouring the same ids. */
export function rankCandidates(
  caseId: string,
  candidates: FanoutCandidate[],
  stats: ReadonlyMap<string, FanoutStats>,
  rules: NewcomerRules,
): RankedCandidate[] {
  return candidates
    .map((c) => {
      const s = stats.get(c.id) ?? NO_STATS;
      return {
        id: c.id,
        score: scoreCandidate(c, s),
        isNew: isNewcomer(s, rules),
        exposure: exposureBonus(s.alertsTotal, rules.maxAlerts),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        hash01(caseId + a.id) - hash01(caseId + b.id) ||
        (a.id < b.id ? -1 : 1),
    );
}

/**
 * One wave: [size] people from the ranked list. Up to [quotaPercent] % of
 * the places are reserved for newcomers — least exposed first (exposure
 * decays by alerts received, not by time), best score on ties; if there are
 * fewer newcomers than places, the rest go to the best-ranked others.
 * With room for everyone the whole list is returned in ranked order.
 */
export function selectWave(
  ranked: RankedCandidate[],
  size: number,
  quotaPercent: number,
): RankedCandidate[] {
  const n = Math.max(0, Math.floor(size));
  if (n >= ranked.length) return [...ranked];
  const quota = Math.min(
    n,
    Math.floor((n * Math.min(100, Math.max(0, quotaPercent))) / 100),
  );
  const newcomers = ranked
    .filter((r) => r.isNew)
    .sort((a, b) => b.exposure - a.exposure || b.score - a.score)
    .slice(0, quota);
  const picked = new Set(newcomers.map((r) => r.id));
  const rest = ranked
    .filter((r) => !picked.has(r.id))
    .slice(0, n - picked.size);
  return [...newcomers, ...rest].sort((a, b) => b.score - a.score);
}
