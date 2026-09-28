import { Injectable } from '@nestjs/common';
import { CostGuardService } from '../../../../common/cost-guard/cost-guard.service';
import type {
  CheckOutcome,
  IdVerificationInput,
  IdVerificationProvider,
} from '../verification-providers';

/**
 * Shared shape of the paid identity providers (docs/03 §2.4 `id_check` +
 * `face_match`). `verify` reserves one unit of the global CostGuard
 * `id_check` budget BEFORE the (future) provider call — PROVIDER_BUDGET_
 * EXCEEDED propagates, the caller records a manual_review check instead.
 * `matchFace` belongs to the same provider session and costs nothing
 * extra.
 *
 * TODO(docs/03_VERIFICATION_PROFILES.md §2.4 / docs/06 §2.3.7): create the
 * real verification session (Stripe Identity VerificationSession / Persona
 * inquiry) once keys exist; until then these stubs answer manual_review so
 * enabling a flag early never blocks an attorney.
 */
abstract class PaidIdVerificationProvider implements IdVerificationProvider {
  abstract readonly name: 'stripe_identity' | 'persona';

  constructor(private readonly costGuard: CostGuardService) {}

  async verify(input: IdVerificationInput): Promise<CheckOutcome> {
    await this.costGuard.consume('id_check');
    return this.notImplemented(input);
  }

  matchFace(input: IdVerificationInput): Promise<CheckOutcome> {
    return Promise.resolve(this.notImplemented(input));
  }

  private notImplemented(input: IdVerificationInput): CheckOutcome {
    return {
      result: 'manual_review',
      details: {
        provider: this.name,
        requestId: input.requestId,
        reason: 'adapter_not_implemented',
      },
    };
  }
}

/** Flag `stripe_identity`. */
@Injectable()
export class StripeIdentityProvider extends PaidIdVerificationProvider {
  readonly name = 'stripe_identity' as const;

  constructor(costGuard: CostGuardService) {
    super(costGuard);
  }
}

/** Flag `persona_verification`. */
@Injectable()
export class PersonaIdVerificationProvider extends PaidIdVerificationProvider {
  readonly name = 'persona' as const;

  constructor(costGuard: CostGuardService) {
    super(costGuard);
  }
}
