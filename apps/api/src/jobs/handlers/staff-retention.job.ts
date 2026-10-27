import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/** Rows per DELETE (one short statement) and statements per table per run. */
export const STAFF_RETENTION_BATCH = 500;
export const STAFF_RETENTION_MAX_BATCHES = 200;
const DAY_MS = 86_400_000;

/**
 * Staff package (plan B5): cron job `staff.retention` (03:00 UTC, lane
 * cron-heavy; the plan's 03:40 is taken by crashes.purge). Owned by T1.
 * Deletes the two event journals past their period: staff_quality_signals
 * (`staff.retention.signals_days`, 120) and work_lease_events
 * (`staff.retention.lease_events_days`, 90). staff_actions and
 * admin_appeals are the legal record and are never touched.
 * Those journals only fill while leasing or the rating is on, so with
 * both `staff.lease_enabled` and `staff.rating_enabled` off (the default)
 * the job returns at once without a query.
 * Batches of 500 by the created_at index, at most 100 000 rows per table
 * per night; the rest goes the next night.
 */
@Injectable()
export class StaffRetentionJob {
  constructor(
    private readonly staff: StaffSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async run(now = new Date()): Promise<StaffJobResult> {
    const s = await this.staff.get();
    if (
      !s.switches['staff.lease_enabled'] &&
      !s.switches['staff.rating_enabled']
    ) {
      return STAFF_JOB_OFF;
    }
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const signals = await this.purge(() => {
      const cut = before(s.numbers['staff.retention.signals_days']);
      return this.prisma.$executeRaw`
        DELETE FROM "staff_quality_signals" WHERE "id" IN (
          SELECT "id" FROM "staff_quality_signals" WHERE "created_at" < ${cut}
          ORDER BY "created_at" LIMIT ${STAFF_RETENTION_BATCH})`;
    });
    const leaseEvents = await this.purge(() => {
      const cut = before(s.numbers['staff.retention.lease_events_days']);
      return this.prisma.$executeRaw`
        DELETE FROM "work_lease_events" WHERE "id" IN (
          SELECT "id" FROM "work_lease_events" WHERE "created_at" < ${cut}
          ORDER BY "created_at" LIMIT ${STAFF_RETENTION_BATCH})`;
    });
    return { signals, leaseEvents };
  }

  private async purge(batch: () => Promise<number>): Promise<number> {
    let total = 0;
    for (let i = 0; i < STAFF_RETENTION_MAX_BATCHES; i++) {
      const n = await batch();
      total += n;
      if (n < STAFF_RETENTION_BATCH) break;
    }
    return total;
  }
}
