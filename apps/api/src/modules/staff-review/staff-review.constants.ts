import type { SampleVerdict } from '../staff-rating/staff-sampling.service';

/** The lease kind of a re-check sample (work_leases.kind). */
export const REVIEW_LEASE_KIND = 'review_sample';

/** staff_review_samples.decision_kind prefix of a peer (calibration) copy. */
export const PEER_PREFIX = 'cal_';

/**
 * staff_review_samples.status of a finished peer copy. It is NOT `done` on
 * purpose: the rating's daily counters and the piecework count read only
 * `done` rows, and a calibration copy checks the REVIEWER, not the worker.
 */
export const PEER_DONE = 'peer_done';

/** What a reviewer says about the checked decision. */
export const REVIEW_VERDICTS = ['confirmed', 'overturned', 'unclear'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

/** Why a decision is overturned (a short list; no free-text accusations). */
export const REVIEW_REASONS = [
  'wrong_outcome',
  'missed_signal',
  'policy_misapplied',
  'wrong_reason_text',
  'too_hasty',
  'harmful',
  'other',
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

/** Reviewer verdict → the value T5 stores in staff_review_samples.verdict. */
export function toSampleVerdict(
  verdict: Exclude<ReviewVerdict, 'unclear'>,
  reasons: readonly string[],
): SampleVerdict {
  if (verdict === 'confirmed') return 'same';
  return reasons.includes('harmful') ? 'worse' : 'different';
}

/** `cal_verification` → `verification`. */
export function baseKind(decisionKind: string): string {
  return decisionKind.startsWith(PEER_PREFIX)
    ? decisionKind.slice(PEER_PREFIX.length)
    : decisionKind;
}

/** Two verdicts agree when both confirm or both do not. */
export function sameClass(a: string | null, b: string | null): boolean {
  return (a === 'same') === (b === 'same');
}

/** Agreement in percent (null = nothing to compare). */
export function agreementPct(agree: number, pairs: number): number | null {
  return pairs > 0 ? Math.round((100 * agree) / pairs) : null;
}

/** Returned rate in percent: items that came back (reopened or complained
 * about) of all closed ones. Null = no decisions. */
export function returnedRatePct(
  decided: number,
  reopened: number,
  complaints: number,
): number | null {
  if (decided <= 0) return null;
  return Math.min(
    100,
    Math.round((1000 * (reopened + complaints)) / decided) / 10,
  );
}
