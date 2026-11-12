import { createHash } from 'node:crypto';
import type { Verdict, VerdictDecision } from './ai-worker.prompt';

/**
 * Owner 2026-11-12: the trust-and-safety pattern of large platforms (AI first
 * pass with a confidence score; routing by confidence; random audit of the
 * confident ones; learning from the reviewer's corrections; a human makes
 * every final decision).
 *
 *  - `bulk`     confident, no red flag, no injection attempt: the owner can
 *               approve the whole list in one tap;
 *  - `priority` low confidence, unclear / request_info, a conflict with the
 *               platform's own red flags, or an injection attempt: the owner
 *               looks first;
 *  - `audit`    a confident one picked at random (role.audit_pct %): shown
 *               like priority to catch drift.
 */
export type Lane = 'bulk' | 'priority' | 'audit';
export const LANES: readonly Lane[] = ['priority', 'audit', 'bulk'];

export interface RoutingPolicy {
  confidenceMin: number;
  auditPct: number;
}

/** A proposal that disagrees with what the platform already knows. */
export function conflictsWithFlags(
  decision: VerdictDecision,
  flags: readonly string[],
): boolean {
  return decision === 'approve' && flags.length > 0;
}

/**
 * Deterministic random sample: the same item always lands on the same side
 * (a re-collected batch cannot move it), uniform over ids.
 */
export function inAuditSample(itemId: string, pct: number): boolean {
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  const h = createHash('sha256').update(`ai-audit:${itemId}`).digest();
  return h.readUInt32BE(0) % 10_000 < Math.round(pct * 100);
}

export function routeLane(
  v: Pick<Verdict, 'decision' | 'confidence' | 'injectionSuspected'>,
  flags: readonly string[],
  policy: RoutingPolicy,
  itemId: string,
): Lane {
  const confident =
    v.confidence >= policy.confidenceMin &&
    (v.decision === 'approve' || v.decision === 'reject');
  if (
    !confident ||
    v.injectionSuspected ||
    conflictsWithFlags(v.decision, flags)
  ) {
    return 'priority';
  }
  return inAuditSample(itemId, policy.auditPct) ? 'audit' : 'bulk';
}

// ------------------------------------------------------------- feedback

export interface ReviewedRow {
  decision: string | null;
  confidence: number | null;
  status: string;
  ownerDecision: string | null;
  ownerNote: string | null;
  flags: string[];
}

/** The owner's verdict on a proposal: agreed, or what he says is right. */
export const agreed = (r: Pick<ReviewedRow, 'status'>): boolean =>
  r.status === 'approved';

/**
 * Few-shot from the owner's decisions: corrections first (they teach the
 * most), then agreements, newest first, at most [max].
 */
export function pickFeedback(
  rows: readonly ReviewedRow[],
  max: number,
): ReviewedRow[] {
  const corrections = rows.filter((r) => !agreed(r));
  const agreements = rows.filter(agreed);
  return [...corrections, ...agreements].slice(0, max);
}

export interface AgreementStats {
  reviewed: number;
  agreed: number;
  /** 0-100, null while nothing is reviewed. */
  ratePct: number | null;
}

export function agreementStats(counts: {
  approved: number;
  rejected: number;
}): AgreementStats {
  const reviewed = counts.approved + counts.rejected;
  return {
    reviewed,
    agreed: counts.approved,
    ratePct: reviewed ? Math.round((counts.approved * 100) / reviewed) : null,
  };
}
