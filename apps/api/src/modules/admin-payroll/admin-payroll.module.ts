import { Module } from '@nestjs/common';
import { PartnersCoreModule } from '../partners/partners.module';
import { PayrollPartnersBridge } from './payroll-partners.bridge';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminPayrollController } from './admin-payroll.controller';
import { AdminPayrollService } from './admin-payroll.service';
import { PayrollStripeService } from './payroll-stripe.service';
import { PayrollAccrualsService } from './payroll-accruals.service';

/** Owner 2026-10-05: the payroll itself — also used by the worker
 * (owner 2026-10-06: automatic pay day in `treasury.daily`). */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule, PartnersCoreModule],
  providers: [
    AdminPayrollService,
    PayrollStripeService,
    PayrollAccrualsService,
    PayrollPartnersBridge,
  ],
  /** Other modules (partner program) accrue commissions here. */
  exports: [AdminPayrollService, PayrollAccrualsService],
})
export class AdminPayrollCoreModule {}

/** Owner 2026-10-05: Деньги → Зарплаты (staff salaries). */
@Module({
  imports: [AdminPayrollCoreModule],
  controllers: [AdminPayrollController],
  exports: [AdminPayrollCoreModule],
})
export class AdminPayrollModule {}
