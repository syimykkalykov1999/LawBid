import { Module } from '@nestjs/common';
import { StaffPieceworkJob } from '../../jobs/handlers/staff-piecework.job';
import { StaffPieceworkController } from './staff-piecework.controller';

/**
 * Staff package (T7): piecework rates and the nightly accrual into payroll_accruals.
 * Core part (providers, the cron jobs), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off.
 */
@Module({
  providers: [StaffPieceworkJob],
  exports: [StaffPieceworkJob],
})
export class StaffPieceworkCoreModule {}

/** Staff package (T7): the admin routes of staff-piecework (API only). */
@Module({
  imports: [StaffPieceworkCoreModule],
  controllers: [StaffPieceworkController],
})
export class StaffPieceworkModule {}
