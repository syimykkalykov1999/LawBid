import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminReferralsController } from './admin-referrals.controller';
import { AdminReferralsService } from './admin-referrals.service';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/** The referral service alone — imported by billing (first paid invoice),
 * cases (first case), promotions (credit days) and the worker. Uses the
 * global PAYMENT_PROVIDER when present. */
@Module({
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsCoreModule {}

/** Owner 2026-10-02: referral endpoints of the app and the admin. */
@Module({
  imports: [ReferralsCoreModule, AdminAccessModule],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [AdminReferralsService],
})
export class ReferralsModule {}
