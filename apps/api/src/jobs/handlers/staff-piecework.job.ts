import { Injectable } from '@nestjs/common';
import { StaffPieceworkService } from '../../modules/staff-piecework/staff-piecework.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.piecework` (15 10 * * * UTC, lane
 * cron-heavy; deliberately not on the heavy-lane list, it only reads
 * yesterday's stored counters). Yesterday's units x rates x quality ->
 * one payroll_accruals row per person (event_ref
 * `staff_piecework:{admin}:{day}`, idempotent), see StaffPieceworkService.
 * While staff.piecework_enabled is off (the default) it returns at once
 * without touching the database.
 *
 * Row 180 B9: «yesterday» is the day of the owner's report time zone
 * (`admin.report_timezone`), with the safe cut-over of
 * common/utils/report-day-schedule; the run counts every day that ended in
 * the last 25 hours (normally one), so the switch day is neither skipped
 * nor counted twice.
 */
@Injectable()
export class StaffPieceworkJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly piecework: StaffPieceworkService,
  ) {}

  async run(now: Date = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.piecework_enabled')))
      return STAFF_JOB_OFF;
    const out = {
      day: '',
      days: '',
      admins: 0,
      accrued: 0,
      totalCents: 0,
      skippedNoPayroll: 0,
      skippedDisputed: 0,
      noRating: 0,
      paidDiffs: 0,
    };
    const days = await this.piecework.dueDays(now);
    for (const day of days) {
      const r = await this.piecework.computeDay(day);
      out.day = r.day;
      out.admins += r.admins;
      out.accrued += r.accrued;
      out.totalCents += r.totalCents;
      out.skippedNoPayroll += r.skippedNoPayroll;
      out.skippedDisputed += r.skippedDisputed;
      out.noRating += r.noRating;
      out.paidDiffs += r.paidDiffs.length;
    }
    out.days = days.join(',');
    return out;
  }
}
