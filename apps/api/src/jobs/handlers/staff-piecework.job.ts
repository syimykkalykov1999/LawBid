import { Injectable, Optional } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { reportTimeZone } from '../../common/utils/report-day';
import { yesterdayOf } from '../../modules/staff-piecework/piecework.calc';
import { StaffPieceworkService } from '../../modules/staff-piecework/staff-piecework.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.piecework` (15 10 * * * UTC, lane
 * cron-heavy; deliberately not on the heavy-lane list, it only reads
 * yesterday's stored counters). Owner 14.11 (row 180, B9): «yesterday» is
 * the last complete day of the report time zone (`admin.report_timezone`),
 * the same day as `staff.daily-stats` (09:10 UTC) and the rating snapshot
 * (09:40 UTC), which run first. Yesterday's units x rates x quality ->
 * one payroll_accruals row per person (event_ref
 * `staff_piecework:{admin}:{day}`, idempotent), see StaffPieceworkService.
 * While staff.piecework_enabled is off (the default) it returns at once
 * without touching the database.
 */
@Injectable()
export class StaffPieceworkJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly piecework: StaffPieceworkService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  async run(now: Date = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.piecework_enabled')))
      return STAFF_JOB_OFF;
    const r = await this.piecework.computeDay(
      yesterdayOf(now, await reportTimeZone(this.settings)),
    );
    return {
      day: r.day,
      admins: r.admins,
      accrued: r.accrued,
      totalCents: r.totalCents,
      skippedNoPayroll: r.skippedNoPayroll,
      skippedDisputed: r.skippedDisputed,
      noRating: r.noRating,
      paidDiffs: r.paidDiffs.length,
    };
  }
}
