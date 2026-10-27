import { Global, Module } from '@nestjs/common';
import { StaffDailyStatsJob } from '../../jobs/handlers/staff-daily-stats.job';
import { StaffRatingNightlyJob } from '../../jobs/handlers/staff-rating-nightly.job';
import { STAFF_RECORDER } from '../staff-core/staff-recorder.port';
import { STAFF_SIGNALS } from '../staff-core/staff-signals.port';
import {
  StaffRatingController,
  StaffShortlistController,
} from './staff-rating.controller';
import { StaffAnomalyService } from './staff-anomaly.service';
import { StaffCountersService } from './staff-counters.service';
import { StaffDailyStatsService } from './staff-daily-stats.service';
import { StaffRatingReadService } from './staff-rating-read.service';
import { StaffRatingService } from './staff-rating.service';
import { StaffRecorderService } from './staff-recorder.service';
import { StaffSamplingService } from './staff-sampling.service';

/**
 * Staff package (T5): rating / KPI, samples, golden tasks, suggestions (no AI).
 * Core part (providers, the cron jobs, the port bindings), imported by
 * StaffModule (API) and JobsModule (API + worker). Everything stays a no-op
 * while its switch is off (`staff.rating_enabled` and friends, all off by
 * default). Global so any module can inject STAFF_RECORDER / STAFF_SIGNALS
 * without an import.
 */
@Global()
@Module({
  providers: [
    StaffCountersService,
    StaffRecorderService,
    StaffSamplingService,
    StaffDailyStatsService,
    StaffAnomalyService,
    StaffRatingService,
    StaffDailyStatsJob,
    StaffRatingNightlyJob,
    { provide: STAFF_RECORDER, useExisting: StaffRecorderService },
    { provide: STAFF_SIGNALS, useExisting: StaffRecorderService },
  ],
  exports: [
    StaffCountersService,
    StaffSamplingService,
    StaffDailyStatsJob,
    StaffRatingNightlyJob,
    STAFF_RECORDER,
    STAFF_SIGNALS,
  ],
})
export class StaffRatingCoreModule {}

/** Staff package (T5): the admin routes of staff-rating (API only). */
@Module({
  imports: [StaffRatingCoreModule],
  controllers: [StaffRatingController, StaffShortlistController],
  providers: [StaffRatingReadService],
})
export class StaffRatingModule {}
