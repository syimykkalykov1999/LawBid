import {
  DAY_MS,
  decay,
  HOUR_MS,
  logScale,
  saturate,
  weighted,
} from './ranking.math';

/**
 * Cases in an attorney's Search (owner 2026-10-13): which open cases to
 * show first — the ones this attorney can win: their practice, their
 * states, fresh, a real budget, few offers, and no offer from them yet.
 */
export const CASE_WEIGHTS = {
  /** Case practice vs the attorney's practices and history. */
  practice: 0.2,
  /** The case is in a state the attorney is licensed in. */
  state: 0.12,
  /** Newer is better (3-day scale). */
  fresh: 0.1,
  /** A stated budget, log scale ($10k = full). */
  budget: 0.06,
  /** Fewer offers so far = better chance. */
  competition: 0.06,
  /** Urgency / deadline. */
  urgency: 0.06,
  /** Client rating. */
  client: 0.04,
  /** Views and comments: the case draws attention. */
  demand: 0.02,
  /** OQ-054: the client was around lately (a silent client sinks the case). */
  clientActive: 0.1,
  /** OQ-054: urgent / very urgent with an active client go first; a silent
   * urgent one drops fast. */
  urgentActive: 0.17,
  /** OQ-054: «по дате» cases rise as the date gets closer. */
  dateNear: 0.07,
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
  /** OQ-054: the client's own last action on the case. */
  clientActiveAt: Date;
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

/** Client silent this long (days) still counts as active for an urgent case. */
export const URGENT_ACTIVE_DAYS = 2;
/** `clientActive` falls to 1/e after this many silent days. */
export const CLIENT_ACTIVE_SCALE_DAYS = 7;
/** `dateNear` falls to 1/e this many days before the date is the far end. */
export const DATE_NEAR_SCALE_DAYS = 21;

/** OQ-054: 1 while the client was around, fading with their silence. */
export function clientActiveScore(clientActiveAt: Date, now: number): number {
  return decay(
    now - clientActiveAt.getTime(),
    CLIENT_ACTIVE_SCALE_DAYS * DAY_MS,
  );
}

/**
 * OQ-054: urgent / very urgent cases with a client active within
 * URGENT_ACTIVE_DAYS score 1 (very urgent) / 0.85 (urgent); past that they
 * drop fast (half-life ~1 day). Other levels score 0.
 */
export function urgentActiveScore(
  urgency: string | null,
  clientActiveAt: Date,
  now: number,
): number {
  const level = urgency === 'very_urgent' ? 1 : urgency === 'urgent' ? 0.85 : 0;
  if (level === 0) return 0;
  const silentDays = (now - clientActiveAt.getTime()) / DAY_MS;
  if (silentDays <= URGENT_ACTIVE_DAYS) return level;
  return level * Math.exp(-(silentDays - URGENT_ACTIVE_DAYS) * Math.LN2);
}

/**
 * OQ-054: a «по дате» case rises more and more as the date nears (clients
 * post early to find an attorney in time): 1 on the day, ~0.5 at 14 days,
 * ~0.06 at 60. A passed date scores 0 (the stale rules take over).
 */
export function dateNearScore(
  urgency: string | null,
  deadlineAt: Date | null,
  now: number,
): number {
  if (urgency !== 'by_date' || !deadlineAt) return 0;
  const days = (deadlineAt.getTime() - now) / DAY_MS;
  if (days < -1) return 0;
  return Math.exp(-Math.max(0, days) / DATE_NEAR_SCALE_DAYS);
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
    clientActive: clientActiveScore(c.clientActiveAt, now),
    urgentActive: urgentActiveScore(c.urgency, c.clientActiveAt, now),
    dateNear: dateNearScore(c.urgency, c.deadlineAt, now),
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
