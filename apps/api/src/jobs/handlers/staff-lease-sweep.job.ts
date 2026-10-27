import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.lease-sweep` (* * * * * UTC, lane cron-fast).
 * Frees expired leases, writes work_lease_events, sends lease:lost (safety net of the socket timer).
 * Owner of this file: T3 (work-lease) (T1 only registered the stub). While
 * staff.lease_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffLeaseSweepJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.lease_enabled'))) return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}
