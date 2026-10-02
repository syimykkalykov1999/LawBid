import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminBillingController } from './admin-billing.controller';
import { BillingOverviewService } from './billing-overview.service';
import { BillingPromoController } from './billing-promo.controller';
import { ContractGrantsService } from './contract-grants.service';
import { PromoCodesService } from './promo-codes.service';
import { RefundsService } from './refunds.service';

/**
 * Owner 2026-10-02: admin billing tools (contract grants, promo codes,
 * payments + refunds, billing overview) and the app's promo check.
 * PAYMENT_PROVIDER comes from the global BillingModule.
 */
@Module({
  imports: [AdminAccessModule, NotificationsModule, SubscriptionsModule],
  controllers: [AdminBillingController, BillingPromoController],
  providers: [
    ContractGrantsService,
    PromoCodesService,
    RefundsService,
    BillingOverviewService,
  ],
})
export class AdminBillingModule {}
