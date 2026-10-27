import { Injectable } from '@nestjs/common';
import { LeaseService } from '../../modules/work-lease/lease.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.lease-sweep` (* * * * * UTC, lane cron-fast).
 * Frees expired leases, writes work_lease_events, sends lease:lost (safety net of the socket timer):
 * a holder who stopped signalling (60 s grace) or stopped moving (5 min) loses the item; a lease past
 * its time is renewed on its own while the holder is online and moving, else it goes back.
 * Owner of this file: T3 (work-lease). While staff.lease_enabled is off (the default) it returns at
 * once without touching the database.
 */
@Injectable()
export class StaffLeaseSweepJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly leases: LeaseService,
  ) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.lease_enabled'))) return STAFF_JOB_OFF;
    return this.leases.sweep();
  }
}
