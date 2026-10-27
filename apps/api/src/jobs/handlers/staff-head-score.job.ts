import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.head-score` (55 1 * * * UTC, lane cron-heavy).
 * Score of workspace heads + automatic signals about them.
 * Owner of this file: T6 (staff-appeals) (T1 only registered the stub). While
 * staff.head_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffHeadScoreJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.head_enabled'))) return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}
