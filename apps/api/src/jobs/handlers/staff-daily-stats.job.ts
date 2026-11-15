import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  previousReportDay,
  reportTimeZone,
} from '../../common/utils/report-day';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffAnomalyService } from '../../modules/staff-rating/staff-anomaly.service';
import { StaffDailyStatsService } from '../../modules/staff-rating/staff-daily-stats.service';
import { StaffSamplingService } from '../../modules/staff-rating/staff-sampling.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.daily-stats` (10 9 * * * UTC, lane cron-heavy).
 * Yesterday's aggregate per staff member (incremental, by time indexes).
 * Owner 14.11 (row 180): «yesterday» is the last complete day of the report
 * time zone (`admin.report_timezone`); 09:10 UTC is just after midnight in
 * Nevada (01:10 PST / 02:10 PDT).
 * Owner of this file: T5 (staff-rating). While staff.rating_enabled is off
 * (the default) it returns at once without touching Redis or the database.
 * Order: Redis counters of the day → staff_daily_stats (absolute values, so
 * a re-run of the same day gives the same rows) → the sampling dice queue
 * becomes review samples and golden tasks → the anomaly pass
 * (staff.anomalies_enabled). Every step is its own switch.
 */
@Injectable()
export class StaffDailyStatsJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly stats: StaffDailyStatsService,
    private readonly sampling: StaffSamplingService,
    private readonly anomalies: StaffAnomalyService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  async run(now: Date = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.rating_enabled'))) return STAFF_JOB_OFF;
    const day = previousReportDay(now, await reportTimeZone(this.settings));
    const { rows, counters } = await this.stats.computeDay(day);
    const samples = await this.sampling.drainQueue(now);
    const golden = await this.sampling.issueGolden(
      new Map(
        rows
          .filter((r) => r.role !== null && r.decided > 0)
          .map((r) => [r.adminId, { decided: r.decided, role: r.role! }]),
      ),
    );
    const anomalies = (await this.staff.isOn('staff.anomalies_enabled'))
      ? await this.anomalies.detect(day, rows, counters)
      : 0;
    return { day, people: rows.length, samples, golden, anomalies };
  }
}
