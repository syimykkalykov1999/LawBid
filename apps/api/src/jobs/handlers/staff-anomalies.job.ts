import { Injectable, Optional } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffAnomalyService } from '../../modules/staff-security/staff-anomaly.service';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import {
  previousReportDay,
  reportTimeZone,
} from '../../common/utils/report-day';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.anomalies` (25 10 * * * UTC, lane cron-heavy).
 * Yesterday's card counters against the group median -> staff_anomalies,
 * «yesterday» being the day of the owner's report time zone (row 180 B9,
 * `admin.report_timezone`; the run is just after midnight in Nevada, so
 * the counters of that day are complete),
 * top-N for the owner, plus one digest line (StaffAnomalyService).
 * Owner of this file: T11 (staff-security). While staff.anomalies_enabled is
 * off (the default) it returns at once without touching Redis or the database.
 */
@Injectable()
export class StaffAnomaliesJob {
  constructor(
    private readonly staff: StaffSettingsService,
    @Optional() private readonly anomalies?: StaffAnomalyService,
    @Optional() private readonly appSettings?: AppSettingsService,
  ) {}

  async run(now: Date = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.anomalies_enabled')))
      return STAFF_JOB_OFF;
    if (!this.anomalies) return STAFF_JOB_STUB;
    const tz = await reportTimeZone(this.appSettings);
    const yesterday = previousReportDay(now, tz);
    return { ...(await this.anomalies.computeDay(yesterday)) };
  }
}
