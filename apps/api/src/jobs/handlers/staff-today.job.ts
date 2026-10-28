import { Injectable, Optional } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffTodayService } from '../../modules/staff-home/staff-today.service';
import { StaffTodaySystemService } from '../../modules/staff-home/staff-today-system.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.today` (every 2 minutes UTC, lane cron-fast).
 * Builds the owner «Сегодня» page into Redis from snapshots and counters
 * (ONE query over small tables, see StaffTodayService). Owner of this file:
 * T10 (staff-home). While staff.owner_home_enabled is off (the default) it
 * returns at once without touching the database.
 * Owner 2026-10-27: the «Система» block (system actions for the owner) is
 * refreshed by the same job, but only when its own 5-minute reading is stale,
 * so the job stays cheap and the Sentry budget (1 request / 5 min) holds.
 */
@Injectable()
export class StaffTodayJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly today: StaffTodayService,
    @Optional() private readonly system?: StaffTodaySystemService,
  ) {}

  async run(now: Date = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.owner_home_enabled')))
      return STAFF_JOB_OFF;
    const t = await this.today.refresh();
    const out: Record<string, number | string> = {
      appeals: t.appeals?.open ?? 0,
      suggestions: t.suggestions?.open ?? 0,
      decision: t.decision?.code ?? 'none',
    };
    if (this.system) {
      try {
        const s = await this.system.refreshIfStale(now);
        if (s) {
          out.systemItems = s.items.length;
          out.systemCritical = s.counts.critical;
        }
      } catch {
        out.system = 'failed';
      }
    }
    return out;
  }
}
