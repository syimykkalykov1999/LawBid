import { Module } from '@nestjs/common';
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
import { PayLinkService } from '../billing/pay-link.service';

/** The promotion service alone — imported by billing (checkout webhook),
 * the jobs module (`promotions.expire`) and the HTTP module below. Uses
 * the global PAYMENT_PROVIDER when present. */
@Module({
  imports: [ReferralsCoreModule, NotificationsModule, StarsCoreModule],
  // PayLinkService: the card page's signed links (owner 2026-10-22), here so
  // billing (which imports this module) and promotions share one.
  providers: [PromotionsService, PromotionDeliveryService, PayLinkService],
  exports: [PromotionsService, PromotionDeliveryService, PayLinkService],
})
export class PromotionsCoreModule {}

/** Owner 2026-10-02: case promotion endpoints of the app and the admin. */
@Module({
  imports: [
    PromotionsCoreModule,
    ReferralsCoreModule,
    AdminAccessModule,
    StarsCoreModule,
  ],
  controllers: [PromotionsController, AdminPromotionsController],
  // RefundsService: "cancel and refund" right from the promotion row.
  providers: [AdminPromotionsService, RefundsService],
})
export class PromotionsModule {}
