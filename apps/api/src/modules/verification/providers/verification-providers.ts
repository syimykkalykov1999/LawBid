import type { CheckResult } from '@prisma/client';

/** docs/03_VERIFICATION_PROFILES.md §2 / stage 3.1: pluggable external
 * checks. Paid implementations (state bar adapters, Stripe Identity,
 * Persona) are switched on by feature flags in stage 3.4 and must go
 * through CostGuardService ('id_check'); the default `manual`
 * implementations below never call anything and send every request to a
 * human verifier. */
export interface CheckOutcome {
  result: CheckResult;
  details: Record<string, unknown>;
}

export interface BarLookupProvider {
  readonly name: string;
  lookup(input: {
    stateCode: string;
    barNumber: string;
    firstName: string;
    lastName: string;
  }): Promise<CheckOutcome>;
}

export interface IdVerificationProvider {
  readonly name: string;
  verify(input: {
    requestId: string;
    attorneyId: string;
  }): Promise<CheckOutcome>;
}

export const BAR_LOOKUP_PROVIDER = Symbol('BAR_LOOKUP_PROVIDER');
export const ID_VERIFICATION_PROVIDER = Symbol('ID_VERIFICATION_PROVIDER');
