import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { PlansService } from './plans.service';

/**
 * Owner 2026-10-05 (plan builder): plans + the entitlements gate. Global,
 * like Prisma and Redis — bids, assistants, cases, search and billing all
 * ask EntitlementsService, and the worker must boot with it too. The
 * controllers (public plan list, /me/entitlements, the client's plan
 * purchase, the admin builder) are registered by BillingModule /
 * AdminBillingModule, which own PAYMENT_PROVIDER and PricingService.
 */
@Global()
@Module({
  providers: [PlansService, EntitlementsService],
  exports: [PlansService, EntitlementsService],
})
export class PlansCoreModule {}
