import {
  agreementStats,
  inAuditSample,
  type AgreementStats,
} from '../ai-worker/ai-worker.routing';
import type { RejectionCode } from './verification.constants';

/**
 * Owner 2026-11-12 (row 60): «Автоматическое решение по адвокатам» — the
 * rules, pure. The pattern of the identity platforms (Persona Workflows
 * «approve / decline / mark for review», Stripe Identity «verified /
 * requires_input + resubmit», Onfido/Entrust Studio «clear / consider»,
 * Uber Real-Time ID Check «a mismatch goes to people, every removal can be
 * appealed»): every fact must agree for an automatic approval; only a
 * fact the platform itself measured and that clearly fails rejects; the
 * rest waits for a person. The model's own «reject» never rejects.
 */
export type AutoProposal = 'approve' | 'reject' | 'request_info' | 'queue';

/** One licence of the request against its state registry lookup (the
 * newest `bar_lookup` check of this request). */
export type RegistryVerdict =
  | 'pass'
  | 'not_found'
  | 'not_active'
  | 'name_mismatch'
  | 'unavailable'
  | 'none';

export interface AutoDecisionInput {
  /** `verification.auto_decision.enabled`. */
  enabled: boolean;
  /** The attorney is the owner or a staff member (role admin / admin profile). */
  staffAccount: boolean;
  /** Request status; only `submitted` (nobody took it yet) is decided. */
  status: string;
  /** The biometric consent of the selfie step was given. */
  consent: boolean;
  licenses: ReadonlyArray<{
    stateCode: string;
    formatUnusual: boolean;
    registry: RegistryVerdict;
  }>;
  identity: {
    hasIdFront: boolean;
    /** The ID type needs a back side (driver licence, state ID) and it is missing. */
    missingBack: boolean;
    hasSelfie: boolean;
  };
  face: {
    result: 'pass' | 'fail' | 'manual_review' | 'none';
    similarity: number | null;
    reason: string | null;
  };
  /** `verification.auto_decision.face_reject_below`. */
  faceRejectBelow: number;
  /** The selfie came from the app camera with a valid one-time token and
   * the liveness challenge passed. */
  liveness: boolean;
  /** The AI employee's newest proposal on the request (attorney_verification
   * queue) the owner did not overrule, or null. */
  ai: { decision: string; lane: string | null } | null;
  persona: { required: boolean; passed: boolean };
  /** `verification.auto_decision.ai_request_info_enabled`. */
  requestInfoEnabled: boolean;
}

export interface AutoVerdict {
  proposal: AutoProposal;
  /** Reject: a REJECTION_CODES value; request_info / queue: why. */
  reason: string | null;
}

/** Face match reasons that mean «take the photo again», not «another person». */
const RETAKE_REASONS: ReadonlySet<string> = new Set([
  'low_quality',
  'no_face',
  'image_missing',
  'unsupported_format',
  'image_too_large',
]);

/** A confident AI proposal: routed to bulk or audit (confidence at or above
 * the role's minimum, no red flag, no injection attempt). */
const confidentAi = (ai: AutoDecisionInput['ai'], decision: string): boolean =>
  !!ai &&
  ai.decision === decision &&
  (ai.lane === 'bulk' || ai.lane === 'audit');

/** null = the rules do not run at all (switch off, staff account, a person
 * already has the request): nothing is written, nothing changes. */
export function decideAutomatically(i: AutoDecisionInput): AutoVerdict | null {
  if (!i.enabled || i.staffAccount || i.status !== 'submitted') return null;
  const queue = (reason: string): AutoVerdict => ({
    proposal: 'queue',
    reason,
  });
  // BIPA / CUBI / RCW 19.375: no consent, no automatic decision of any kind.
  if (!i.consent) return queue('no_biometric_consent');
  if (i.licenses.length === 0) return queue('no_license');

  // Clear failures, measured by the platform itself (never the model).
  const reject = (reason: RejectionCode): AutoVerdict => ({
    proposal: 'reject',
    reason,
  });
  if (i.licenses.some((l) => l.registry === 'not_found'))
    return reject('license_not_found');
  if (i.licenses.some((l) => l.registry === 'not_active'))
    return reject('license_inactive');
  if (
    i.face.result === 'fail' &&
    i.face.similarity !== null &&
    i.face.similarity < i.faceRejectBelow
  )
    return reject('selfie_mismatch');

  // Optional lever: ask the attorney to upload again.
  if (i.requestInfoEnabled) {
    if (i.identity.missingBack)
      return { proposal: 'request_info', reason: 'id_back_missing' };
    if (
      i.face.result === 'manual_review' &&
      RETAKE_REASONS.has(i.face.reason ?? '')
    )
      return { proposal: 'request_info', reason: `photo_${i.face.reason}` };
    if (confidentAi(i.ai, 'request_info'))
      return { proposal: 'request_info', reason: 'ai_request_info' };
  }

  // Everything must match for an approval.
  if (i.licenses.some((l) => l.formatUnusual)) return queue('format_unusual');
  const notPassed = i.licenses.find((l) => l.registry !== 'pass');
  if (notPassed) return queue(`registry_${notPassed.registry}`);
  if (!i.identity.hasIdFront || !i.identity.hasSelfie)
    return queue('identity_missing');
  if (i.identity.missingBack) return queue('id_back_missing');
  if (i.face.result !== 'pass') return queue(`face_${i.face.result}`);
  if (!i.liveness) return queue('liveness_not_passed');
  if (i.persona.required && !i.persona.passed)
    return queue('persona_not_passed');
  if (!i.ai) return queue('ai_not_reviewed');
  if (!confidentAi(i.ai, 'approve')) return queue(`ai_${i.ai.decision}`);
  return { proposal: 'approve', reason: null };
}

/**
 * The audit sample, %: [start] (10) until the owner's decisions on the
 * sampled requests prove the rules right, then down to [min] (2-5). The
 * steps follow the AI employee's agreement stats (ai-worker.routing.ts):
 * 50 reviewed at ≥ 95 % agreement → 5 %, 200 reviewed at ≥ 98 % → the floor.
 */
export function auditSamplePct(
  start: number,
  min: number,
  stats: AgreementStats,
): number {
  const floor = Math.max(0, Math.min(min, start));
  const rate = stats.ratePct ?? 0;
  if (stats.reviewed >= 200 && rate >= 98) return floor;
  if (stats.reviewed >= 50 && rate >= 95)
    return Math.max(floor, Math.min(start, 5));
  return start;
}

export function agreementOf(counts: { agreed: number; disagreed: number }) {
  return agreementStats({
    approved: counts.agreed,
    rejected: counts.disagreed,
  });
}

/** Deterministic: the same request always lands on the same side. */
export const inAutoAuditSample = (requestId: string, pct: number): boolean =>
  inAuditSample(`verification-auto:${requestId}`, pct);

/** The band of the face similarity kept in the evidence instead of the
 * number (the biometric number itself is deleted with the face match row
 * after `verification.face_match.retention_days`). */
export function faceBand(
  similarity: number | null,
  rejectBelow: number,
  threshold: number,
): 'match' | 'unclear' | 'far_apart' | 'not_measured' {
  if (similarity === null) return 'not_measured';
  if (similarity >= threshold) return 'match';
  return similarity < rejectBelow ? 'far_apart' : 'unclear';
}

/** The fixed message of an automatic «request info» (the app shows it as
 * the verifier's message). */
export function requestInfoMessage(reason: string | null): string {
  if (reason === 'id_back_missing')
    return 'Please upload the back side of your ID as well.';
  if (reason === 'ai_request_info')
    return 'Some details could not be confirmed from your documents. Please upload clear photos of your ID and bar card again.';
  return 'Your photo could not be checked (blurry, dark or no face visible). Please take the selfie with your ID again in good light.';
}
