import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { BidsModule } from '../bids/bids.module';
import { JournalModule } from '../journal/journal.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminStateRegistriesController } from './controllers/admin-state-registries.controller';
import { AdminVerificationController } from './controllers/admin-verification.controller';
import { VerificationController } from './controllers/verification.controller';
import { AutoBarLookupProvider } from './providers/bar-lookup/auto-bar-lookup.provider';
import { GenericRestAdapter } from './providers/bar-lookup/generic-rest.adapter';
import { SocrataAdapter } from './providers/bar-lookup/socrata.adapter';
import {
  STATE_BAR_ADAPTERS,
  type StateBarAdapter,
} from './providers/bar-lookup/state-bar-adapter';
import {
  PersonaIdVerificationProvider,
  StripeIdentityProvider,
} from './providers/id/paid-id-verification.providers';
import {
  ManualBarLookupProvider,
  ManualIdVerificationProvider,
} from './providers/manual.providers';
import { VerificationProviderSelector } from './providers/verification-provider.selector';
import { NyOpenDataAdapter } from './providers/bar-lookup/ny-open-data.adapter';
import {
  BAR_LOOKUP_PROVIDER,
  ID_VERIFICATION_PROVIDER,
} from './providers/verification-providers';
import { VerificationAdminService } from './services/verification-admin.service';
import { VerificationChecksService } from './services/verification-checks.service';
import { StateRegistryService } from './services/state-registry.service';
import { VerificationRequestsService } from './services/verification-requests.service';

/**
 * docs/03_VERIFICATION_PROFILES.md §2: attorney verification requests
 * (stage 3.3), automatic checks selected by feature flags and the
 * verifier admin API (stage 3.4).
 */
@Module({
  imports: [
    FeatureFlagsModule,
    FilesModule,
    NotificationsModule,
    AdminAccessModule,
    // RateLimitService: per-verifier document link limit.
    AuthModule,
    // docs/04 §14: bid withdrawals on suspension go through the machine.
    BidsModule,
    JournalModule,
  ],
  controllers: [
    VerificationController,
    AdminVerificationController,
    AdminStateRegistriesController,
  ],
  providers: [
    ManualBarLookupProvider,
    ManualIdVerificationProvider,
    StripeIdentityProvider,
    PersonaIdVerificationProvider,
    // Owner 2026-10-05: the ways a state registry can be asked. Which one a
    // state uses (and its key) is set per state in the admin
    // (StateRegistryService); states without one fall back to manual
    // review, where the verifier opens the state bar's profile link.
    NyOpenDataAdapter,
    {
      provide: STATE_BAR_ADAPTERS,
      useFactory: (
        ny: NyOpenDataAdapter,
        config: ConfigService,
      ): StateBarAdapter[] => {
        // Plain http / local hosts only outside production (e2e fakes).
        const allowLocal = config.get<string>('NODE_ENV') !== 'production';
        return [
          ny,
          new SocrataAdapter(allowLocal),
          new GenericRestAdapter(allowLocal),
        ];
      },
      inject: [NyOpenDataAdapter, ConfigService],
    },
    StateRegistryService,
    AutoBarLookupProvider,
    VerificationProviderSelector,
    // Default (flag-off) implementations, kept for direct injection.
    { provide: BAR_LOOKUP_PROVIDER, useExisting: ManualBarLookupProvider },
    {
      provide: ID_VERIFICATION_PROVIDER,
      useExisting: ManualIdVerificationProvider,
    },
    VerificationChecksService,
    VerificationRequestsService,
    VerificationAdminService,
  ],
  exports: [
    // docs/06 §3.4: user suspension applies the §2.5 attorney effects.
    VerificationAdminService,
    BAR_LOOKUP_PROVIDER,
    ID_VERIFICATION_PROVIDER,
    VerificationProviderSelector,
    // Owner 2026-10-04: the monthly registry re-check job reads the states.
    StateRegistryService,
  ],
})
export class VerificationModule {}
