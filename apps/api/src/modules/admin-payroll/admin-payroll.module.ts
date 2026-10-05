import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminPayrollController } from './admin-payroll.controller';
import { AdminPayrollService } from './admin-payroll.service';
import { PayrollStripeService } from './payroll-stripe.service';

/** Owner 2026-10-05: Деньги → Зарплаты (staff salaries). */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule],
  controllers: [AdminPayrollController],
  providers: [AdminPayrollService, PayrollStripeService],
})
export class AdminPayrollModule {}
