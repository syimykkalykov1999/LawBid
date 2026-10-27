import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.weekly-digest` (0 13 * * 1 UTC, lane cron).
 * The weekly «5 чисел» into staff_digests and to the owner.
 * Owner of this file: T10 (staff-home) (T1 only registered the stub). While
 * staff.weekly_digest_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffWeeklyDigestJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.weekly_digest_enabled')))
      return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}
