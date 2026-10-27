import { Injectable } from '@nestjs/common';
import { Prisma, type AdminWorkspace } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  StaffSettingsService,
  type StaffSettings,
} from '../staff-core/staff-settings.service';
import {
  emptyTotals,
  computeRating,
  deriveStatus,
  isGreen,
  planSuggestions,
  rankPct,
  type RatingConfig,
  type StaffStatus,
  type SuggestionKind,
  type WindowTotals,
} from './staff-rating.formulas';

const DAY_MS = 86_400_000;
const CHUNK = 300;
/** Open suggestions nobody touched for this long expire by themselves. */
const SUGGESTION_EXPIRE_DAYS = 30;
const NEGATIVE = [
  'reopened',
  'complaint',
  'appeal_won',
  'overturned',
  'sample_diff',
  'golden_fail',
  'csat_down',
];
const POSITIVE = ['csat_up', 'golden_pass'];

export interface EvidenceRef {
  kind: string;
  itemKind: string;
  itemId: string;
}

export interface SnapshotDraft {
  adminId: string;
  workspace: AdminWorkspace;
  rating: number | null;
  n: number;
  accuracy: number | null;
  clean: number | null;
  users: number | null;
  speed: number | null;
  status: StaffStatus;
  flags: string[];
  rankPct: number | null;
  evidence: Prisma.InputJsonObject;
}

export function ratingConfig(s: StaffSettings, finance: boolean): RatingConfig {
  const n = s.numbers;
  return {
    minDecisions: finance
      ? n['staff.rating.min_decisions_finance']
      : n['staff.rating.min_decisions'],
    weights: {
      accuracy: n['staff.rating.weight_accuracy_pct'],
      clean: n['staff.rating.weight_clean_pct'],
      users: n['staff.rating.weight_users_pct'],
      speed: n['staff.rating.weight_speed_pct'],
    },
    norm: n['staff.rating.norm'],
    yellowBelow: n['staff.rating.yellow_below'],
    redBelow: n['staff.rating.red_below'],
    greenTopPct: n['staff.rating.green_top_pct'],
    yellowComplaintsPerWeek: n['staff.rating.yellow_complaints_per_week'],
    redOverturnedInRow: n['staff.rating.red_overturned_in_row'],
  };
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Staff package T5: the nightly rating. Reads the per-day numbers
 * (staff_daily_stats, by the day index) and a few small groupBys; writes
 * ONE snapshot row per person (staff_rating_snapshots, absolute values, so
 * a re-run of the same date changes nothing) and, behind
 * `staff.suggestions_enabled`, the suggestions. The admin only ever reads
 * the snapshots. Nothing here removes or replaces anybody: pull / replace /
 * reward / more_review are rows for a human; only the warning may be
 * applied by the system, and only when `staff.auto_apply_enabled` is on.
 */
@Injectable()
export class StaffRatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StaffSettingsService,
  ) {}

  async runNightly(now: Date = new Date()): Promise<{
    date: string;
    rated: number;
    lowData: number;
    suggestions: number;
  }> {
    const s = await this.settings.get();
    const today = new Date(`${dayStr(now)}T00:00:00.000Z`);
    const windowDays = s.numbers['staff.rating.window_days'];
    const from = new Date(today.getTime() - windowDays * DAY_MS);
    const weekFrom = new Date(today.getTime() - 7 * DAY_MS);
    const yesterday = new Date(today.getTime() - DAY_MS);

    const [sums, week, overturned, rushing, offboarded] = await Promise.all([
      this.prisma.staffDailyStat.groupBy({
        by: ['admin_id'],
        where: { day: { gte: from, lt: today } },
        _sum: {
          decided: true,
          reopened: true,
          complaints: true,
          csat_up: true,
          csat_down: true,
          sampled: true,
          sample_diff: true,
          golden_total: true,
          golden_fail: true,
          too_fast: true,
          late_sla: true,
          lease_lost: true,
        },
      }),
      this.prisma.staffDailyStat.groupBy({
        by: ['admin_id'],
        where: { day: { gte: weekFrom, lt: today } },
        _sum: { complaints: true },
      }),
      this.prisma.staffQualitySignal.groupBy({
        by: ['admin_id'],
        where: {
          kind: 'overturned',
          created_at: { gte: new Date(now.getTime() - 7 * DAY_MS) },
        },
        _count: { _all: true },
      }),
      this.prisma.staffAnomaly.findMany({
        where: { day: yesterday, rule: 'rushing' },
        select: { admin_id: true },
      }),
      this.prisma.staffMemberState.findMany({
        where: { state: 'offboarded' },
        select: { admin_id: true },
      }),
    ]);
    const gone = new Set(offboarded.map((x) => x.admin_id));
    const ids = sums.map((x) => x.admin_id).filter((id) => !gone.has(id));
    const profiles = await this.prisma.adminProfile.findMany({
      where: { user_id: { in: ids } },
      select: { user_id: true, workspace: true },
    });
    const workspace = new Map(profiles.map((p) => [p.user_id, p.workspace]));
    const weekComplaints = new Map(
      week.map((w) => [w.admin_id, w._sum.complaints ?? 0]),
    );
    const overturnedWeek = new Map(
      overturned.map((o) => [o.admin_id, o._count._all]),
    );
    const hurried = new Set(rushing.map((r) => r.admin_id));
    const [evidence, trend] = await Promise.all([
      this.evidence(from),
      this.trend(today),
    ]);

    const drafts: SnapshotDraft[] = [];
    for (const row of sums) {
      if (gone.has(row.admin_id)) continue;
      const ws = workspace.get(row.admin_id) ?? 'mass';
      if (ws === 'owner') continue;
      const v = row._sum;
      const t: WindowTotals = {
        ...emptyTotals(),
        decided: v.decided ?? 0,
        reopened: v.reopened ?? 0,
        complaints: v.complaints ?? 0,
        csatUp: v.csat_up ?? 0,
        csatDown: v.csat_down ?? 0,
        sampled: v.sampled ?? 0,
        sampleDiff: v.sample_diff ?? 0,
        goldenTotal: v.golden_total ?? 0,
        goldenFail: v.golden_fail ?? 0,
        tooFast: v.too_fast ?? 0,
        lateSla: v.late_sla ?? 0,
        leaseLost: v.lease_lost ?? 0,
      };
      if (t.decided === 0 && t.reopened + t.complaints + t.sampleDiff === 0)
        continue;
      const cfg = ratingConfig(s, ws === 'finance');
      const rating = computeRating(t, cfg);
      const { status, flags } = deriveStatus(
        {
          rating,
          complaintsWeek: weekComplaints.get(row.admin_id) ?? 0,
          overturnedWeek: overturnedWeek.get(row.admin_id) ?? 0,
          goldenFail: t.goldenFail,
          rushing: hurried.has(row.admin_id),
        },
        cfg,
      );
      const ev = evidence.get(row.admin_id);
      drafts.push({
        adminId: row.admin_id,
        workspace: ws,
        rating: rating.rating,
        n: t.decided,
        accuracy: rating.accuracy,
        clean: rating.clean,
        users: rating.users,
        speed: rating.speed,
        status,
        flags,
        rankPct: null,
        evidence: {
          best: (ev?.best ?? []) as unknown as Prisma.InputJsonValue,
          worst: (ev?.worst ?? []) as unknown as Prisma.InputJsonValue,
          trend: trend.get(row.admin_id) ?? [],
          window: {
            from: dayStr(from),
            to: dayStr(yesterday),
            days: windowDays,
          },
          totals: { ...t },
        },
      });
    }

    // Rank inside each workspace among the people who have a rating.
    for (const ws of ['mass', 'finance'] as const) {
      const peers = drafts.filter(
        (d) => d.workspace === ws && d.rating !== null,
      );
      const ratings = peers.map((d) => d.rating as number);
      for (const d of peers) {
        d.rankPct = rankPct(ratings, d.rating as number);
        if (
          isGreen(
            d.status,
            d.rating,
            d.rankPct,
            ratingConfig(s, ws === 'finance'),
          )
        ) {
          d.status = 'green';
        }
      }
    }

    await this.writeSnapshots(today, drafts);
    const suggestions = s.switches['staff.suggestions_enabled']
      ? await this.writeSuggestions(today, now, drafts, s)
      : 0;
    return {
      date: dayStr(today),
      rated: drafts.filter((d) => d.status !== 'low_data').length,
      lowData: drafts.filter((d) => d.status === 'low_data').length,
      suggestions,
    };
  }

  /** Up to 3 latest negative and 3 latest positive decisions per person. */
  private async evidence(
    from: Date,
  ): Promise<Map<string, { best: EvidenceRef[]; worst: EvidenceRef[] }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        admin_id: string;
        kind: string;
        item_kind: string;
        item_id: string;
        neg: boolean;
      }>
    >`
      SELECT admin_id, kind, item_kind, item_id, neg FROM (
        SELECT admin_id, kind, item_kind, item_id,
               (kind = ANY(${NEGATIVE}::text[])) AS neg,
               row_number() OVER (
                 PARTITION BY admin_id, (kind = ANY(${NEGATIVE}::text[]))
                 ORDER BY created_at DESC) AS rn
        FROM staff_quality_signals
        WHERE created_at >= ${from} AND kind = ANY(${[...NEGATIVE, ...POSITIVE]}::text[])
      ) t WHERE rn <= 3`;
    const out = new Map<
      string,
      { best: EvidenceRef[]; worst: EvidenceRef[] }
    >();
    for (const r of rows) {
      const e = out.get(r.admin_id) ?? { best: [], worst: [] };
      (r.neg ? e.worst : e.best).push({
        kind: r.kind,
        itemKind: r.item_kind,
        itemId: r.item_id,
      });
      out.set(r.admin_id, e);
    }
    return out;
  }

  /** Last 8 weekly ratings per person (snapshots of today minus 7k days). */
  private async trend(
    today: Date,
  ): Promise<Map<string, Array<{ date: string; rating: number }>>> {
    const dates = Array.from(
      { length: 8 },
      (_, k) => new Date(today.getTime() - (k + 1) * 7 * DAY_MS),
    );
    const rows = await this.prisma.staffRatingSnapshot.findMany({
      where: { snapshot_date: { in: dates }, rating: { not: null } },
      select: { admin_id: true, snapshot_date: true, rating: true },
      orderBy: { snapshot_date: 'asc' },
    });
    const out = new Map<string, Array<{ date: string; rating: number }>>();
    for (const r of rows) {
      const list = out.get(r.admin_id) ?? [];
      list.push({ date: dayStr(r.snapshot_date), rating: r.rating as number });
      out.set(r.admin_id, list);
    }
    return out;
  }

  private async writeSnapshots(date: Date, drafts: SnapshotDraft[]) {
    for (let i = 0; i < drafts.length; i += CHUNK) {
      const values = drafts.slice(i, i + CHUNK).map(
        (d) =>
          Prisma.sql`(${d.adminId}::uuid, ${date}::date, ${d.workspace}::admin_workspace,
            ${d.rating}::int, ${d.n}::int, ${d.accuracy}::int, ${d.clean}::int,
            ${d.users}::int, ${d.speed}::int, ${d.status}, ${d.flags}::text[],
            ${d.rankPct}::smallint, ${JSON.stringify(d.evidence)}::jsonb)`,
      );
      await this.prisma.$executeRaw`
        INSERT INTO staff_rating_snapshots
          (admin_id, snapshot_date, workspace, rating, n_decisions, accuracy, clean,
           users_verdict, speed, status, flags, rank_pct, evidence)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (admin_id, snapshot_date) DO UPDATE SET
          workspace = EXCLUDED.workspace, rating = EXCLUDED.rating,
          n_decisions = EXCLUDED.n_decisions, accuracy = EXCLUDED.accuracy,
          clean = EXCLUDED.clean, users_verdict = EXCLUDED.users_verdict,
          speed = EXCLUDED.speed, status = EXCLUDED.status, flags = EXCLUDED.flags,
          rank_pct = EXCLUDED.rank_pct, evidence = EXCLUDED.evidence`;
    }
  }

  private async writeSuggestions(
    date: Date,
    now: Date,
    drafts: SnapshotDraft[],
    s: StaffSettings,
  ): Promise<number> {
    const warnDays = s.numbers['staff.warnings.window_days'];
    const warnFrom = new Date(now.getTime() - warnDays * DAY_MS);
    const existing = await this.prisma.staffSuggestion.findMany({
      where: {
        OR: [
          { status: 'open' },
          {
            kind: 'warn',
            status: { not: 'dismissed' },
            created_at: { gte: warnFrom },
          },
        ],
      },
      select: { admin_id: true, kind: true, status: true, created_at: true },
    });
    const byAdmin = new Map<string, typeof existing>();
    for (const e of existing) {
      const list = byAdmin.get(e.admin_id) ?? [];
      list.push(e);
      byAdmin.set(e.admin_id, list);
    }
    const autoWarn = s.switches['staff.auto_apply_enabled'];
    const toCreate: Prisma.StaffSuggestionCreateManyInput[] = [];
    const actions: Prisma.StaffActionCreateManyInput[] = [];
    for (const d of drafts) {
      const mine = byAdmin.get(d.adminId) ?? [];
      const warns = mine.filter(
        (e) => e.kind === 'warn' && e.created_at >= warnFrom,
      );
      const last = warns.reduce<Date | null>(
        (a, e) => (a === null || e.created_at > a ? e.created_at : a),
        null,
      );
      const kinds: SuggestionKind[] = planSuggestions({
        status: d.status,
        warningsInWindow: warns.length,
        daysSinceLastWarning:
          last === null
            ? null
            : Math.floor((now.getTime() - last.getTime()) / DAY_MS),
        openKinds: new Set(
          mine.filter((e) => e.status === 'open').map((e) => e.kind),
        ),
        warningsForReplace: s.numbers['staff.warnings.for_replace'],
      });
      for (const kind of kinds) {
        const applied = kind === 'warn' && autoWarn;
        const evidence = {
          status: d.status,
          rating: d.rating,
          n: d.n,
          flags: d.flags,
          rankPct: d.rankPct,
        };
        toCreate.push({
          admin_id: d.adminId,
          kind,
          status: applied ? 'applied' : 'open',
          snapshot_date: date,
          evidence,
          decided_at: applied ? now : null,
        });
        if (applied) {
          actions.push({
            admin_id: d.adminId,
            actor_id: null,
            source: 'suggestion',
            kind: 'warn',
            reason_code: d.flags[0] ?? 'low_rating',
            rating_snapshot: evidence,
          });
        }
      }
    }
    let created = 0;
    if (toCreate.length > 0) {
      const res = await this.prisma.staffSuggestion.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      created = res.count;
      // The journal row only for a warning that really was written now
      // (a re-run of the night hits the unique key and writes nothing).
      if (actions.length > 0 && res.count > 0) {
        const fresh = await this.prisma.staffSuggestion.findMany({
          where: {
            snapshot_date: date,
            kind: 'warn',
            status: 'applied',
            admin_id: { in: actions.map((a) => a.admin_id) },
            decided_at: now,
          },
          select: { admin_id: true },
        });
        const wrote = new Set(fresh.map((f) => f.admin_id));
        const rows = actions.filter((a) => wrote.has(a.admin_id));
        if (rows.length > 0)
          await this.prisma.staffAction.createMany({ data: rows });
      }
    }
    // Housekeeping: stale or no-longer-true suggestions expire.
    const healthy = drafts
      .filter((d) => d.status === 'ok' || d.status === 'green')
      .map((d) => d.adminId);
    await this.prisma.staffSuggestion.updateMany({
      where: {
        status: 'open',
        OR: [
          {
            created_at: {
              lt: new Date(now.getTime() - SUGGESTION_EXPIRE_DAYS * DAY_MS),
            },
          },
          ...(healthy.length > 0
            ? [{ admin_id: { in: healthy }, kind: { not: 'reward' } }]
            : []),
        ],
      },
      data: { status: 'expired' },
    });
    return created;
  }
}
