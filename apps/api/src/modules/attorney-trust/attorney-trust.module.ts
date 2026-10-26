import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminConfigModule } from '../admin-config/admin-config.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AuthModule } from '../auth/auth.module';
import { BidStateMachine } from '../bids/domain/bid-state-machine';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminTrustController } from './admin-trust.controller';
import { AdminTrustService } from './admin-trust.service';
import { AttorneyTrustService } from './attorney-trust.service';
import { BarNumberBlocksService } from './bar-number-blocks.service';
import { FirmEmailService } from './firm-email.service';
import { TrustController } from './trust.controller';

/**
 * Owner 2026-10-05: attorney trust levels (docs/ATTORNEY_TRUST.md) — the
 * service only. `@Global()` because the gate is read from bids, payments,
 * profiles, reports and the verification module; BidStateMachine is
 * provided here directly (it only needs Prisma) so BidsModule can depend
 * on the gate without a cycle. The worker imports this one.
 */
@Global()
@Module({
  imports: [NotificationsModule, JournalModule],
  providers: [AttorneyTrustService, BarNumberBlocksService, BidStateMachine],
  exports: [AttorneyTrustService, BarNumberBlocksService],
})
export class AttorneyTrustCoreModule {}

/** The HTTP side: the attorney's / client's view, the firm e-mail code and
 * Admin → Верификация → «Уровни доверия». API process only. */
@Module({
  imports: [
    AttorneyTrustCoreModule,
    AdminAccessModule,
    AdminConfigModule,
    // EMAIL_PROVIDER for the firm e-mail code.
    AuthModule,
    // «Вход и письма по почте» gates the firm e-mail code.
    FeatureFlagsModule,
  ],
  controllers: [TrustController, AdminTrustController],
  providers: [AdminTrustService, FirmEmailService],
})
export class AttorneyTrustModule {}
