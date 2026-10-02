import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { ReferralsCoreModule } from '../referrals/referrals.module';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminPromotionsService } from './admin-promotions.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

/** The promotion service alone — imported by billing (checkout webhook),
 * the jobs module (`promotions.expire`) and the HTTP module below. Uses
 * the global PAYMENT_PROVIDER when present. */
@Module({
  imports: [ReferralsCoreModule, NotificationsModule],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsCoreModule {}

/** Owner 2026-10-02: case promotion endpoints of the app and the admin. */
@Module({
  imports: [PromotionsCoreModule, ReferralsCoreModule, AdminAccessModule],
  controllers: [PromotionsController, AdminPromotionsController],
  providers: [AdminPromotionsService],
})
export class PromotionsModule {}
