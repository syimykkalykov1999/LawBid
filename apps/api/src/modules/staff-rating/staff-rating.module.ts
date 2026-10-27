import { Global, Module } from '@nestjs/common';
import { StaffDailyStatsJob } from '../../jobs/handlers/staff-daily-stats.job';
import { StaffRatingNightlyJob } from '../../jobs/handlers/staff-rating-nightly.job';
import {
  STAFF_RECORDER,
  NoopStaffRecorder,
} from '../staff-core/staff-recorder.port';
import { StaffRatingController } from './staff-rating.controller';

/**
 * Staff package (T5): rating / KPI, samples, golden tasks, suggestions (no AI).
 * Core part (providers, the cron jobs, the port binding), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off. Global so any module can inject STAFF_RECORDER without an import.
 */
@Global()
@Module({
  providers: [
    StaffDailyStatsJob,
    StaffRatingNightlyJob,
    { provide: STAFF_RECORDER, useClass: NoopStaffRecorder },
  ],
  exports: [StaffDailyStatsJob, StaffRatingNightlyJob, STAFF_RECORDER],
})
export class StaffRatingCoreModule {}

/** Staff package (T5): the admin routes of staff-rating (API only). */
@Module({
  imports: [StaffRatingCoreModule],
  controllers: [StaffRatingController],
})
export class StaffRatingModule {}
