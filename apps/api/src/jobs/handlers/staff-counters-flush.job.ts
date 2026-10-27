import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.counters-flush` (9 * * * * UTC, lane cron).
 * Redis counters of decisions -> staff_daily_stats (upsert, at most 1000 rows).
 * Owner of this file: T3 (work-lease) (T1 only registered the stub). While
 * staff.rating_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffCountersFlushJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.rating_enabled'))) return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}
