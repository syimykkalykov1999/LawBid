import type { CheckResult } from '@prisma/client';

/** docs/03_VERIFICATION_PROFILES.md §2.4: pluggable external checks.
 * Implementations are chosen per call by VerificationProviderSelector
 * from the feature flags (`auto_bar_check`, `stripe_identity`,
 * `persona_verification`), so flipping a flag in the admin panel switches
 * the check without a release. Paid ID checks consume the CostGuard
 * `id_check` budget before calling out. The default `manual`
 * implementations never call anything and send every request to a human
 * verifier. */
export interface CheckOutcome {
  result: CheckResult;
  details: Record<string, unknown>;
}

export interface BarLookupInput {
  stateCode: string;
  barNumber: string;
  firstName: string;
  lastName: string;
}

export interface BarLookupProvider {
  readonly name: string;
  lookup(input: BarLookupInput): Promise<CheckOutcome>;
}

export interface IdVerificationInput {
  requestId: string;
  attorneyId: string;
}

export interface IdVerificationProvider {
  readonly name: string;
  /** Identity document check (`id_check`). */
  verify(input: IdVerificationInput): Promise<CheckOutcome>;
  /** Selfie vs document photo (`face_match`), same provider session. */
  matchFace(input: IdVerificationInput): Promise<CheckOutcome>;
}

export const BAR_LOOKUP_PROVIDER = Symbol('BAR_LOOKUP_PROVIDER');
export const ID_VERIFICATION_PROVIDER = Symbol('ID_VERIFICATION_PROVIDER');

/** Feature flags (seeded off, docs/02 feature_flags) that switch checks. */
export const VERIFICATION_FLAGS = {
  autoBarCheck: 'auto_bar_check',
  stripeIdentity: 'stripe_identity',
  persona: 'persona_verification',
} as const;
