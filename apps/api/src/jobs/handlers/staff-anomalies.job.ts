import { Injectable, Optional } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffAnomalyService } from '../../modules/staff-security/staff-anomaly.service';
import { utcDay } from '../../modules/staff-security/staff-security.util';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.anomalies` (25 2 * * * UTC, lane cron-heavy).
 * Yesterday's card counters against the group median -> staff_anomalies,
 * top-N for the owner, plus one digest line (StaffAnomalyService).
 * Owner of this file: T11 (staff-security). While staff.anomalies_enabled is
 * off (the default) it returns at once without touching Redis or the database.
 */
@Injectable()
export class StaffAnomaliesJob {
  constructor(
    private readonly staff: StaffSettingsService,
    @Optional() private readonly anomalies?: StaffAnomalyService,
  ) {}

  async run(now: Date = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.anomalies_enabled')))
      return STAFF_JOB_OFF;
    if (!this.anomalies) return STAFF_JOB_STUB;
    const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
    return { ...(await this.anomalies.computeDay(yesterday)) };
  }
}
