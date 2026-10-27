import { Module } from '@nestjs/common';
import { StaffPieceworkJob } from '../../jobs/handlers/staff-piecework.job';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminPayrollCoreModule } from '../admin-payroll/admin-payroll.module';
import {
  StaffPieceworkController,
  StaffPieceworkMineController,
  StaffRatesController,
} from './staff-piecework.controller';
import { StaffPieceworkReadService } from './staff-piecework-read.service';
import { StaffPieceworkService } from './staff-piecework.service';
import { StaffRatesService } from './staff-rates.service';

/**
 * Staff package (T7): piecework rates and the nightly accrual into
 * payroll_accruals. Core part (providers, the cron job), imported by
 * StaffModule (API) and JobsModule (API + worker). Money goes only through
 * PayrollAccrualsService (exported by AdminPayrollCoreModule); everything
 * stays a no-op while `staff.piecework_enabled` is off.
 */
@Module({
  imports: [AdminPayrollCoreModule, AdminAccessModule],
  providers: [
    StaffPieceworkJob,
    StaffPieceworkService,
    StaffPieceworkReadService,
    StaffRatesService,
  ],
  exports: [
    StaffPieceworkJob,
    StaffPieceworkService,
    StaffPieceworkReadService,
    StaffRatesService,
  ],
})
export class StaffPieceworkCoreModule {}

/** Staff package (T7): the admin routes of staff-piecework (API only). */
@Module({
  imports: [StaffPieceworkCoreModule],
  controllers: [
    StaffRatesController,
    StaffPieceworkController,
    StaffPieceworkMineController,
  ],
})
export class StaffPieceworkModule {}
