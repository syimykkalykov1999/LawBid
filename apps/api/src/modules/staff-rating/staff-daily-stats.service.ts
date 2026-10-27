import { Injectable } from '@nestjs/common';
import { Prisma, type AdminRole, type AdminWorkspace } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  StaffCountersService,
  toCounterRow,
  type DayCounters,
} from './staff-counters.service';

const UPSERT_CHUNK = 400;

/** One person-day, every column of staff_daily_stats the job owns. */
export interface DailyRow {
  adminId: string;
  day: string;
  workspace: AdminWorkspace;
  role: AdminRole | null;
  decided: number;
  avgHandleSec: number;
  p90HandleSec: number;
  reopened: number;
  complaints: number;
  csatUp: number;
  csatDown: number;
  sampled: number;
  sampleDiff: number;
  goldenTotal: number;
  goldenFail: number;
  tooFast: number;
  lateSla: number;
  leaseLost: number;
  skips: number;
}

const blank = (adminId: string, day: string): DailyRow => ({
  adminId,
  day,
  workspace: 'mass',
  role: null,
  decided: 0,
  avgHandleSec: 0,
  p90HandleSec: 0,
  reopened: 0,
  complaints: 0,
  csatUp: 0,
  csatDown: 0,
  sampled: 0,
  sampleDiff: 0,
  goldenTotal: 0,
  goldenFail: 0,
  tooFast: 0,
  lateSla: 0,
  leaseLost: 0,
  skips: 0,
});

/** Signal kinds that count as a complaint-type mark after a close. */
const COMPLAINT_KINDS = new Set(['complaint', 'appeal_won', 'overturned']);

/**
 * Staff package T5: yesterday's numbers per staff member →
 * staff_daily_stats. Three cheap reads, each by a time index, never a
 * walk over the big tables:
 *  - the Redis counters of the day (decisions, handling time);
 *  - one groupBy over the day's staff_quality_signals;
 *  - one groupBy over the day's finished review samples and one over the
 *    day's lost / skipped lease events.
 * Everything is written as ABSOLUTE values (INSERT … ON CONFLICT DO UPDATE
 * SET), so a re-run of the same day gives the same rows: yesterday is
 * counted once, however many times the job runs.
 */
@Injectable()
export class StaffDailyStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: StaffCountersService,
  ) {}

  async computeDay(
    day: string,
  ): Promise<{ rows: DailyRow[]; counters: DayCounters[] }> {
    const from = new Date(`${day}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 86_400_000);
    const counters = await this.counters.readDay(day);
    const [signals, samples, lease] = await Promise.all([
      this.prisma.staffQualitySignal.groupBy({
        by: ['admin_id', 'kind'],
        where: { created_at: { gte: from, lt: to } },
        _sum: { value: true },
      }),
      this.prisma.staffReviewSample.groupBy({
        by: ['decided_by', 'is_golden'],
        where: { status: 'done', done_at: { gte: from, lt: to } },
        _count: { _all: true },
      }),
      this.prisma.workLeaseEvent.groupBy({
        by: ['admin_id', 'event'],
        where: {
          created_at: { gte: from, lt: to },
          event: { in: ['lost', 'skipped'] },
          admin_id: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const byAdmin = new Map<string, DailyRow>();
    const row = (id: string) => {
      let r = byAdmin.get(id);
      if (!r) byAdmin.set(id, (r = blank(id, day)));
      return r;
    };
    for (const c of counters) {
      const base = toCounterRow(c);
      const r = row(c.adminId);
      r.decided = base.decided;
      r.avgHandleSec = base.avgHandleSec;
      r.p90HandleSec = base.p90HandleSec;
    }
    for (const s of signals) {
      const r = row(s.admin_id);
      const v = s._sum.value ?? 0;
      if (s.kind === 'reopened') r.reopened += v;
      else if (COMPLAINT_KINDS.has(s.kind)) r.complaints += v;
      else if (s.kind === 'csat_up') r.csatUp += v;
      else if (s.kind === 'csat_down') r.csatDown += v;
      else if (s.kind === 'sample_diff') r.sampleDiff += v;
      else if (s.kind === 'golden_fail') r.goldenFail += v;
      else if (s.kind === 'too_fast') r.tooFast += v;
      else if (s.kind === 'late_sla') r.lateSla += v;
      else if (s.kind === 'lease_lost') r.leaseLost += v;
    }
    for (const s of samples) {
      const r = row(s.decided_by);
      if (s.is_golden) r.goldenTotal += s._count._all;
      else r.sampled += s._count._all;
    }
    for (const l of lease) {
      if (!l.admin_id) continue;
      const r = row(l.admin_id);
      if (l.event === 'lost') r.leaseLost += l._count._all;
      else r.skips += l._count._all;
    }

    const ids = [...byAdmin.keys()];
    if (ids.length > 0) {
      const profiles = await this.prisma.adminProfile.findMany({
        where: { user_id: { in: ids } },
        select: { user_id: true, workspace: true, admin_role: true },
      });
      for (const p of profiles) {
        const r = byAdmin.get(p.user_id)!;
        r.workspace = p.workspace;
        r.role = p.admin_role;
      }
    }
    const rows = [...byAdmin.values()];
    await this.upsert(rows);
    return { rows, counters };
  }

  private async upsert(rows: DailyRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const values = rows.slice(i, i + UPSERT_CHUNK).map(
        (r) =>
          Prisma.sql`(${r.adminId}::uuid, ${r.day}::date, ${r.workspace}::admin_workspace,
            ${r.decided}::int, ${r.avgHandleSec}::int, ${r.p90HandleSec}::int,
            ${r.reopened}::int, ${r.complaints}::int, ${r.csatUp}::int, ${r.csatDown}::int,
            ${r.sampled}::int, ${r.sampleDiff}::int, ${r.goldenTotal}::int, ${r.goldenFail}::int,
            ${r.tooFast}::int, ${r.lateSla}::int, ${r.leaseLost}::int, ${r.skips}::int, now())`,
      );
      await this.prisma.$executeRaw`
        INSERT INTO staff_daily_stats
          (admin_id, day, workspace, decided, avg_handle_sec, p90_handle_sec,
           reopened, complaints, csat_up, csat_down, sampled, sample_diff,
           golden_total, golden_fail, too_fast, late_sla, lease_lost, skips, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (admin_id, day) DO UPDATE SET
          workspace = EXCLUDED.workspace,
          -- the counters only grow within a day: a lost Redis never zeroes a flushed day
          avg_handle_sec = CASE WHEN EXCLUDED.decided >= staff_daily_stats.decided AND EXCLUDED.decided > 0
            THEN EXCLUDED.avg_handle_sec ELSE staff_daily_stats.avg_handle_sec END,
          p90_handle_sec = CASE WHEN EXCLUDED.decided >= staff_daily_stats.decided AND EXCLUDED.decided > 0
            THEN EXCLUDED.p90_handle_sec ELSE staff_daily_stats.p90_handle_sec END,
          decided = GREATEST(EXCLUDED.decided, staff_daily_stats.decided),
          reopened = EXCLUDED.reopened,
          complaints = EXCLUDED.complaints,
          csat_up = EXCLUDED.csat_up,
          csat_down = EXCLUDED.csat_down,
          sampled = EXCLUDED.sampled,
          sample_diff = EXCLUDED.sample_diff,
          golden_total = EXCLUDED.golden_total,
          golden_fail = EXCLUDED.golden_fail,
          too_fast = EXCLUDED.too_fast,
          late_sla = EXCLUDED.late_sla,
          lease_lost = EXCLUDED.lease_lost,
          skips = EXCLUDED.skips,
          updated_at = now()`;
    }
  }
}
