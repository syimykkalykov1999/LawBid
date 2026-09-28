import { Module } from '@nestjs/common';
import { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { BidStateMachine } from './domain/bid-state-machine';

/**
 * docs/04 §5–§7 bids (stage 4.1: state machine; stage 4.4: API — bid
 * creation, withdraw, counter-offers; stage 4.5: acceptance).
 *
 * CaseAccessPolicy is provided directly here (not by importing
 * CasesModule) on purpose: CasesModule also carries CasesController and
 * UsersModule (-> AuthModule, FilesModule) — real HTTP/S3/OTP wiring this
 * module has no business needing, and which the `worker` process (see
 * jobs/worker.module.ts, which imports BidsModule for
 * BidSubscriptionLapseJob) doesn't set up at all. CaseAccessPolicy only
 * takes PrismaService (@Global PrismaModule), so a second instance here
 * is free and avoids that coupling.
 */
@Module({
  imports: [JournalModule, NotificationsModule, SubscriptionsModule],
  controllers: [BidsController],
  providers: [BidStateMachine, CaseAccessPolicy, BidsService],
  exports: [BidStateMachine, BidsService],
})
export class BidsModule {}
