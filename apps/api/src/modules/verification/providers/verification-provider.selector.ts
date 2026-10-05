import { Injectable } from '@nestjs/common';
import type { VerificationProvider } from '@prisma/client';
import { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import { AutoBarLookupProvider } from './bar-lookup/auto-bar-lookup.provider';
import {
  PersonaIdVerificationProvider,
  StripeIdentityProvider,
} from './id/paid-id-verification.providers';
import { ManualIdVerificationProvider } from './manual.providers';
import {
  VERIFICATION_FLAGS,
  type IdVerificationProvider,
} from './verification-providers';

/**
 * Picks the check implementations on every call: bar lookups per state
 * from the admin's registry settings, ID checks from the feature flags
 * (docs/03 §2.4: "Включение флага в админке переключает проверку на
 * автоматическую без релиза и без переписывания кода"). Flags default to
 * off; with all off everything is `manual`. Stripe Identity wins when
 * both identity flags are on.
 */
@Injectable()
export class VerificationProviderSelector {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly autoBar: AutoBarLookupProvider,
    private readonly manualId: ManualIdVerificationProvider,
    private readonly stripe: StripeIdentityProvider,
    private readonly persona: PersonaIdVerificationProvider,
  ) {}

  /** Owner 2026-10-05: the registry is chosen per state in the admin
   * (state_bar_registries) — states without one answer `manual_review`.
   * The old global flag `auto_bar_check` is no longer read. */
  barLookup(): Promise<AutoBarLookupProvider> {
    return Promise.resolve(this.autoBar);
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
