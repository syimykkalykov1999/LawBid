import { Injectable } from '@nestjs/common';
import type { VerificationProvider } from '@prisma/client';
import { AutoBarLookupProvider } from './bar-lookup/auto-bar-lookup.provider';
import { ManualIdVerificationProvider } from './manual.providers';
import type { IdVerificationProvider } from './verification-providers';

/**
 * Picks the check implementations on every call: bar lookups per state
 * from the admin's registry settings; ID checks are always manual (a
 * person looks at the uploaded document — owner 2026-10-16, no paid
 * identity services).
 */
@Injectable()
export class VerificationProviderSelector {
  constructor(
    private readonly autoBar: AutoBarLookupProvider,
    private readonly manualId: ManualIdVerificationProvider,
  ) {}

  /** Owner 2026-10-05: the registry is chosen per state in the admin
   * (state_bar_registries) — states without one answer `manual_review`.
   * The old global flag `auto_bar_check` is no longer read. */
  barLookup(): Promise<AutoBarLookupProvider> {
    return Promise.resolve(this.autoBar);
  }

  idVerification(): Promise<{
    provider: VerificationProvider;
    impl: IdVerificationProvider;
  }> {
    return Promise.resolve({ provider: 'manual', impl: this.manualId });
  }
}
