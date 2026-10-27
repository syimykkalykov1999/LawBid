import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.anomalies` (25 2 * * * UTC, lane cron-heavy).
 * Anomalies against the group median -> staff_anomalies, top-N for the owner.
 * Owner of this file: T11 (staff-security) (T1 only registered the stub). While
 * staff.anomalies_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffAnomaliesJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.anomalies_enabled')))
      return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}
