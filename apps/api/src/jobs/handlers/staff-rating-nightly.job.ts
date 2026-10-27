import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.rating-nightly` (40 1 * * * UTC, lane cron-heavy).
 * Rating, flags, suggestions, samples / golden tasks, trust tiers.
 * Owner of this file: T5 (staff-rating) (T1 only registered the stub). While
 * staff.rating_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffRatingNightlyJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.rating_enabled'))) return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}
