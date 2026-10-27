import { Injectable } from '@nestjs/common';
import { StaffHeadScoreService } from '../../modules/staff-appeals/staff-head-score.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.head-score` (55 1 * * * UTC, lane cron-heavy).
 * Score of workspace heads (staff_head_snapshots) + automatic signals about
 * them for the owner inbox (team turnover, two complaints from different
 * people). Owner of this file: T6 (staff-appeals). While staff.head_enabled
 * is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffHeadScoreJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly score: StaffHeadScoreService,
  ) {}

  async run(now = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.head_enabled'))) return STAFF_JOB_OFF;
    const r = await this.score.run(now);
    return { heads: r.heads, signals: r.signals };
  }
}
