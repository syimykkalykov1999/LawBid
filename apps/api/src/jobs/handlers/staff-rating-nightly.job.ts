import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffRatingService } from '../../modules/staff-rating/staff-rating.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.rating-nightly` (40 1 * * * UTC, lane cron-heavy).
 * Rating, flags, suggestions (samples / golden tasks are made by staff.daily-stats).
 * Owner of this file: T5 (staff-rating). While staff.rating_enabled is off
 * (the default) it returns at once without touching the database. The
 * snapshot of a date is written as absolute values, so a re-run changes
 * nothing; suggestions need staff.suggestions_enabled and are rows for a
 * human — only the warning may be auto-applied (staff.auto_apply_enabled).
 */
@Injectable()
export class StaffRatingNightlyJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly rating: StaffRatingService,
  ) {}

  async run(now: Date = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.rating_enabled'))) return STAFF_JOB_OFF;
    return this.rating.runNightly(now);
  }
}
