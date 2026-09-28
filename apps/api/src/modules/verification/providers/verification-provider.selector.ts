import { Injectable } from '@nestjs/common';
import type { VerificationProvider } from '@prisma/client';
import { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import { AutoBarLookupProvider } from './bar-lookup/auto-bar-lookup.provider';
import {
  PersonaIdVerificationProvider,
  StripeIdentityProvider,
} from './id/paid-id-verification.providers';
import {
  ManualBarLookupProvider,
  ManualIdVerificationProvider,
} from './manual.providers';
import {
  VERIFICATION_FLAGS,
  type BarLookupProvider,
  type IdVerificationProvider,
} from './verification-providers';

/**
 * Picks the check implementations from the feature flags on every call
 * (docs/03 §2.4: "Включение флага в админке переключает проверку на
 * автоматическую без релиза и без переписывания кода"). Flags default to
 * off; with all off everything is `manual`. Stripe Identity wins when
 * both identity flags are on.
 */
@Injectable()
export class VerificationProviderSelector {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly manualBar: ManualBarLookupProvider,
    private readonly autoBar: AutoBarLookupProvider,
    private readonly manualId: ManualIdVerificationProvider,
    private readonly stripe: StripeIdentityProvider,
    private readonly persona: PersonaIdVerificationProvider,
  ) {}

  async barLookup(): Promise<BarLookupProvider> {
    return (await this.flags.isEnabled(VERIFICATION_FLAGS.autoBarCheck, false))
      ? this.autoBar
      : this.manualBar;
  }

  async idVerification(): Promise<{
    provider: VerificationProvider;
    impl: IdVerificationProvider;
  }> {
    if (await this.flags.isEnabled(VERIFICATION_FLAGS.stripeIdentity, false)) {
      return { provider: 'stripe_identity', impl: this.stripe };
    }
    if (await this.flags.isEnabled(VERIFICATION_FLAGS.persona, false)) {
      return { provider: 'persona', impl: this.persona };
    }
    return { provider: 'manual', impl: this.manualId };
  }
}
