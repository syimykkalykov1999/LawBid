import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminBillingController } from './admin-billing.controller';
import { AdminPlansController } from './admin-plans.controller';
import { AdminPlansService } from './admin-plans.service';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminPricingService } from './admin-pricing.service';
import { BillingOverviewService } from './billing-overview.service';
import { BillingPromoController } from './billing-promo.controller';
import { ContractGrantsService } from './contract-grants.service';
import { PromoCodesService } from './promo-codes.service';
import { RefundsService } from './refunds.service';
import {
  AdminSeatLimitRequestsController,
  SeatLimitRequestsController,
} from './seat-limit-requests.controller';
import { SeatLimitRequestsService } from './seat-limit-requests.service';
import { SubscriptionAdminController } from './subscription-admin.controller';
import { SubscriptionAdminService } from './subscription-admin.service';

/**
 * Owner 2026-10-02: admin billing tools (contract grants, promo codes,
 * payments + refunds, billing overview) and the app's promo check.
 * PAYMENT_PROVIDER comes from the global BillingModule.
 */
@Module({
  imports: [AdminAccessModule, NotificationsModule, SubscriptionsModule],
  controllers: [
    AdminBillingController,
    BillingPromoController,
    AdminPricingController,
    // Owner 2026-10-05: the plan builder.
    AdminPlansController,
    SeatLimitRequestsController,
    AdminSeatLimitRequestsController,
    SubscriptionAdminController,
  ],
  providers: [
    ContractGrantsService,
    PromoCodesService,
    RefundsService,
    BillingOverviewService,
    AdminPricingService,
    AdminPlansService,
    SeatLimitRequestsService,
    SubscriptionAdminService,
  ],
})
export class AdminBillingModule {}
