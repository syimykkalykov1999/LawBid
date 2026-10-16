import type { CheckResult } from '@prisma/client';

/** docs/03_VERIFICATION_PROFILES.md §2.4: pluggable external checks.
 * Implementations are chosen per call by VerificationProviderSelector
 * from the admin's per-state registry settings. The `manual`
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
