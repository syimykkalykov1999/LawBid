import {
  FRAUD_STATUS,
  type FraudStatus,
  type MatchAction,
} from './client-fraud.constants';

const RANK: Record<FraudStatus, number> = {
  ok: 0,
  review: 1,
  restricted: 2,
  banned: 3,
};

export function rankOf(s: FraudStatus): number {
  return RANK[s];
}

export function maxStatus(a: FraudStatus, b: FraudStatus): FraudStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

/** What a match with a blocked account does by itself. */
export function statusOfAction(action: MatchAction): FraudStatus {
  return action === 'block'
    ? FRAUD_STATUS.banned
    : action === 'review'
      ? FRAUD_STATUS.restricted
      : FRAUD_STATUS.ok;
}

export interface Thresholds {
  reviewScore: number;
  restrictScore: number;
  banScore: number;
}

export function statusOfScore(score: number, t: Thresholds): FraudStatus {
  if (score >= t.banScore) return FRAUD_STATUS.banned;
  if (score >= t.restrictScore) return FRAUD_STATUS.restricted;
  if (score >= t.reviewScore) return FRAUD_STATUS.review;
  return FRAUD_STATUS.ok;
}

export interface DecisionInput {
  /** Status from matches with blocked accounts. */
  linkStatus: FraudStatus;
  /** Status from the complaint score (clients only; ok otherwise). */
  scoreStatus: FraudStatus;
  /** Total score (link points included) — compared with cleared_score. */
  score: number;
  /** The current row. */
  current: FraudStatus;
  /** The current status was set by a person. */
  currentByStaff: boolean;
  /** Staff cleared the account at this score. */
  clearedScore: number | null;
  /** fraud.auto: actions apply by themselves; off = queue only. */
  auto: boolean;
}

/**
 * The next status of an account:
 * - the stronger of the link rule and the score;
 * - after a staff «Снять», nothing happens until the score grows past
 *   the cleared score (new complaints, a new match);
 * - without automation a restriction or block only queues the account;
 * - a ban stays until a person lifts it, a staff decision is never
 *   lowered automatically (only raised, by automation).
 */
export function decideStatus(x: DecisionInput): FraudStatus {
  let desired = maxStatus(x.linkStatus, x.scoreStatus);
  if (x.clearedScore !== null && x.score <= x.clearedScore) {
    desired = FRAUD_STATUS.ok;
  }
  if (!x.auto && RANK[desired] > RANK.review) desired = FRAUD_STATUS.review;
  if (x.current === FRAUD_STATUS.banned) return FRAUD_STATUS.banned;
  if (x.currentByStaff) return maxStatus(x.current, desired);
  return desired;
}
