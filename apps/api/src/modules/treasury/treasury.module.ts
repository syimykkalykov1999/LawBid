import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminPayrollCoreModule } from '../admin-payroll/admin-payroll.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminTreasuryController } from './admin-treasury.controller';
import { TreasuryStripeService } from './treasury-stripe.service';
import { TreasuryService } from './treasury.service';

/** Owner 2026-10-05 «Прибыль и резерв»: the monthly split of the Stripe
 * balance — run by the cron job `treasury.daily`. Needs the global
 * Config / Prisma / Redis / AppSettings / Ops / Logger. */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule, AdminPayrollCoreModule],
  providers: [TreasuryStripeService, TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryCoreModule {}

/** Деньги → «Прибыль и резерв» in the admin. */
@Module({
  imports: [TreasuryCoreModule],
  controllers: [AdminTreasuryController],
})
export class TreasuryModule {}
