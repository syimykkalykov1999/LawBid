import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminVerificationController } from './controllers/admin-verification.controller';
import { VerificationController } from './controllers/verification.controller';
import { AutoBarLookupProvider } from './providers/bar-lookup/auto-bar-lookup.provider';
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
import {
  BAR_LOOKUP_PROVIDER,
  ID_VERIFICATION_PROVIDER,
} from './providers/verification-providers';
import { VerificationAdminService } from './services/verification-admin.service';
import { VerificationChecksService } from './services/verification-checks.service';
import { VerificationRequestsService } from './services/verification-requests.service';

/** State bar adapters in production. Empty until a state's public
 * database is integrated (see StubStateBarAdapter for the template):
 * with `auto_bar_check` on, every state falls back to manual review. */
const STATE_BAR_ADAPTER_LIST: StateBarAdapter[] = [];

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
  ],
  controllers: [VerificationController, AdminVerificationController],
  providers: [
    ManualBarLookupProvider,
    ManualIdVerificationProvider,
    StripeIdentityProvider,
    PersonaIdVerificationProvider,
    { provide: STATE_BAR_ADAPTERS, useValue: STATE_BAR_ADAPTER_LIST },
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
  ],
})
export class VerificationModule {}
