import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.today` (every 2 minutes UTC, lane cron-fast).
 * Builds the owner «Сегодня» page into Redis from snapshots and counters.
 * Owner of this file: T10 (staff-home) (T1 only registered the stub). While
 * staff.owner_home_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffTodayJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.owner_home_enabled')))
      return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}
