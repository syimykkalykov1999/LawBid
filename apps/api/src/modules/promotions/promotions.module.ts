import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { ReferralsCoreModule } from '../referrals/referrals.module';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminPromotionsService } from './admin-promotions.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PromotionDeliveryService } from './promotion-delivery.service';
import { StarsCoreModule } from '../stars/stars.module';
import { RefundsService } from '../admin-billing/refunds.service';
import { PayLinkModule } from '../billing/pay-link.module';
import { BoostActions } from './boost-actions.service';
import { PromotionRefundsService } from './promotion-refunds.service';
import { PromotionsRollupService } from './promotions-rollup.service';

/** The promotion service alone — imported by billing (checkout webhook),
 * the jobs module (`promotions.expire`) and the HTTP module below. Uses
 * the global PAYMENT_PROVIDER when present. */
import { LedgerModule } from '../ledger/ledger.public';
@Module({
  imports: [
    ReferralsCoreModule,
    NotificationsModule,
    StarsCoreModule,
    PayLinkModule,
    LedgerModule,
    // The refund of the unspent part writes no audit row but needs the
    // refund service, which needs the audit writer (owner 2026-10-27).
    AdminAccessModule,
  ],
  // PayLinkModule: the card page's signed links (owner 2026-10-22).
  // RefundsService: "cancel and refund" right from the promotion row, and the
  // automatic refund of what a per-result boost did not use.
  providers: [
    PromotionsService,
    PromotionDeliveryService,
    PromotionRefundsService,
    PromotionsRollupService,
    RefundsService,
  ],
  exports: [
    PromotionsService,
    PromotionDeliveryService,
    PromotionRefundsService,
    PromotionsRollupService,
    RefundsService,
  ],
})
export class PromotionsCoreModule {}

/**
 * Owner 2026-10-27: the one-line "this person did something real" report
 * for boosts paid per action. Global like the events bus, so follows, chat,
 * bids, comments and saves take it with `@Optional()` and no module import
 * (no new import cycles between those modules and the Boost).
 */
@Global()
@Module({
  imports: [PromotionsCoreModule],
  providers: [BoostActions],
  exports: [BoostActions],
})
export class BoostActionsModule {}

/** Owner 2026-10-02: case promotion endpoints of the app and the admin. */
@Module({
  imports: [
    PromotionsCoreModule,
    BoostActionsModule,
    ReferralsCoreModule,
    AdminAccessModule,
    StarsCoreModule,
  ],
  controllers: [PromotionsController, AdminPromotionsController],
  providers: [AdminPromotionsService],
})
export class PromotionsModule {}
