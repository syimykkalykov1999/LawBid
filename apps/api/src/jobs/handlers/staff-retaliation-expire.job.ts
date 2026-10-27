import { Injectable } from '@nestjs/common';
import { StaffRetaliationService } from '../../modules/staff-appeals/staff-retaliation.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.retaliation-expire` (22 3 * * * UTC, lane cron).
 * Ended holds -> the owner is asked to decide; closes flags whose window is
 * over; reminds of complaints not answered in time (`staff.retaliation.ack_days`).
 * Owner of this file: T6 (staff-appeals). While staff.appeals_enabled is off
 * (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffRetaliationExpireJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly retaliation: StaffRetaliationService,
  ) {}

  async run(now = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.appeals_enabled'))) return STAFF_JOB_OFF;
    const r = await this.retaliation.expire(now);
    return { ...r };
  }
}
