import { Module } from '@nestjs/common';
import { StaffTodayJob } from '../../jobs/handlers/staff-today.job';
import { StaffWeeklyDigestJob } from '../../jobs/handlers/staff-weekly-digest.job';
import { StaffHomeController } from './staff-home.controller';

/**
 * Staff package (T10): the owner «Сегодня» page, settings page, weekly digest.
 * Core part (providers, the cron jobs), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off.
 */
@Module({
  providers: [StaffTodayJob, StaffWeeklyDigestJob],
  exports: [StaffTodayJob, StaffWeeklyDigestJob],
})
export class StaffHomeCoreModule {}

/** Staff package (T10): the admin routes of staff-home (API only). */
@Module({
  imports: [StaffHomeCoreModule],
  controllers: [StaffHomeController],
})
export class StaffHomeModule {}
