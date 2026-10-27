import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffTodayService } from '../../modules/staff-home/staff-today.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.today` (every 2 minutes UTC, lane cron-fast).
 * Builds the owner «Сегодня» page into Redis from snapshots and counters
 * (ONE query over small tables, see StaffTodayService). Owner of this file:
 * T10 (staff-home). While staff.owner_home_enabled is off (the default) it
 * returns at once without touching the database.
 */
@Injectable()
export class StaffTodayJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly today: StaffTodayService,
  ) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.owner_home_enabled')))
      return STAFF_JOB_OFF;
    const t = await this.today.refresh();
    return {
      appeals: t.appeals?.open ?? 0,
      suggestions: t.suggestions?.open ?? 0,
      decision: t.decision?.code ?? 'none',
    };
  }
}
