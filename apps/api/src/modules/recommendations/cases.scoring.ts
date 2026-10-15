import { decay, HOUR_MS, logScale, saturate, weighted } from './ranking.math';

/**
 * Cases in an attorney's Search (owner 2026-10-13): which open cases to
 * show first — the ones this attorney can win: their practice, their
 * states, fresh, a real budget, few offers, and no offer from them yet.
 */
export const CASE_WEIGHTS = {
  /** Case practice vs the attorney's practices and history. */
  practice: 0.28,
  /** The case is in a state the attorney is licensed in. */
  state: 0.18,
  /** Newer is better (3-day scale). */
  fresh: 0.16,
  /** A stated budget, log scale ($10k = full). */
  budget: 0.1,
  /** Fewer offers so far = better chance. */
  competition: 0.1,
  /** Urgency / deadline. */
  urgency: 0.08,
  /** Client rating. */
  client: 0.06,
  /** Views and comments: the case draws attention. */
  demand: 0.04,
} as const;

/** The attorney already made an offer: shown last, not hidden. */
export const ALREADY_BID_FACTOR = 0.15;

export interface CaseCandidate {
  id: string;
  createdAt: Date;
  /** Leaf practice id and its category id. */
  practiceId: string;
  categoryId: string;
  /** Primary and additional state codes. */
  states: string[];
  budgetCents: number | null;
  bidsCount: number;
  viewCount: number;
  commentCount: number;
  urgency: string | null;
  deadlineAt: Date | null;
  clientRatingAvg: number;
  clientRatingCount: number;
}

export interface CaseViewer {
  id: string;
  /** Own practice leaf ids. */
  practiceIds: ReadonlySet<string>;
  /** Category id → interest 0..1 (own practices, offers, saved cases). */
  interests: ReadonlyMap<string, number>;
  /** Verified-licence states. */
  states: ReadonlySet<string>;
  /** Cases the attorney already bid on. */
  bidOn: ReadonlySet<string>;
}

const URGENCY: Record<string, number> = {
  very_urgent: 1,
  urgent: 0.85,
  soon: 0.6,
  within_month: 0.35,
  flexible: 0.2,
};

export function urgencyScore(
  urgency: string | null,
  deadlineAt: Date | null,
  now: number,
): number {
  if (urgency === 'by_date' && deadlineAt) {
    const days = (deadlineAt.getTime() - now) / (24 * HOUR_MS);
    if (days < 0) return 0.1;
    return days <= 14 ? 0.8 : days <= 45 ? 0.5 : 0.3;
  }
  return urgency ? (URGENCY[urgency] ?? 0.3) : 0.3;
}

export function caseFeatures(
  c: CaseCandidate,
  v: CaseViewer,
  now: number,
): Record<keyof typeof CASE_WEIGHTS, number> {
  const own = v.practiceIds.has(c.practiceId) ? 1 : 0;
  const practice = Math.max(own, 0.7 * (v.interests.get(c.categoryId) ?? 0));
  const clientConf = logScale(c.clientRatingCount, 10);
  return {
    practice,
    state: c.states.some((s) => v.states.has(s)) ? 1 : 0,
    fresh: decay(now - c.createdAt.getTime(), 72 * HOUR_MS),
    budget:
      c.budgetCents === null
        ? 0.3
        : 0.4 + 0.6 * logScale(c.budgetCents / 100, 10000),
    competition: Math.exp(-c.bidsCount / 4),
    urgency: urgencyScore(c.urgency, c.deadlineAt, now),
    client:
      c.clientRatingCount > 0
        ? (c.clientRatingAvg / 5) * (0.5 + 0.5 * clientConf)
        : 0.5,
    demand: saturate(c.viewCount + 3 * c.commentCount, 40),
  };
}

export function caseScore(
  c: CaseCandidate,
  v: CaseViewer,
  now: number,
  weights: Record<keyof typeof CASE_WEIGHTS, number> = CASE_WEIGHTS,
): number {
  const base = weighted(weights, caseFeatures(c, v, now));
  return v.bidOn.has(c.id) ? base * ALREADY_BID_FACTOR : base;
}
