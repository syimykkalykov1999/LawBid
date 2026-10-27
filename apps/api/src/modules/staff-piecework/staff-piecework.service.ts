import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AdminWorkspace } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { PayrollAccrualsService } from '../admin-payroll/payroll-accruals.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import {
  accrualRef,
  dayBounds,
  dayStatus,
  effectiveRateCents,
  isDay,
  lineAmountCents,
  nextAccrualRef,
  pickRate,
  qualityFor,
  rateKindOf,
  type DayStatus,
  type PieceworkKind,
} from './piecework.calc';

/** Admins handled per round of queries (keeps every `IN (…)` small). */
export const PIECEWORK_BATCH = 200;
/** How far back the latest rating snapshot is looked for. */
const SNAPSHOT_LOOKBACK_DAYS = 14;
/** Review samples are created within days of the decision; the verdict day
 * is searched inside this window of `created_at` (indexed with `status`). */
const SAMPLE_WINDOW_DAYS = 14;
/** One accrual currency for staff piecework (payroll is USD today). */
export const PIECEWORK_CURRENCY = 'usd';

export interface DayRunResult {
  day: string;
  /** People looked at. */
  admins: number;
  /** People whose accrual was created or changed. */
  accrued: number;
  /** Money (cents) accrued by this run, summed. */
  totalCents: number;
  /** Not on payroll: the day is recorded, nothing is accrued. */
  skippedNoPayroll: number;
  /** Held by the owner: left untouched. */
  skippedDisputed: number;
  /** Counted with no rating snapshot (coefficient 1.00). */
  noRating: number;
  /** The day was already paid and the recount differs: the owner adds a
   * manual adjustment in payroll. */
  paidDiffs: Array<{ adminId: string; deltaCents: number }>;
}

interface Line {
  kind: PieceworkKind;
  units: number;
  held: number;
  rateCents: number;
  amountCents: number;
}

interface Settle {
  ref: string | null;
  changed: boolean;
  paidDeltaCents: number | null;
}

type DayRow = {
  admin_id: string;
  kind: string;
  amount_cents: number;
  accrual_ref: string | null;
  status: string;
};

/**
 * Staff package T7: yesterday's units x rates x quality -> one
 * payroll_accruals row per person per day.
 *
 * Money moves only through PayrollAccrualsService (never a direct write to
 * the payroll tables). Idempotent: the accrual reference is
 * `staff_piecework:<admin>:<day>`; a second run of the same day with the
 * same numbers changes nothing, and a recount that changed the amount
 * cancels the still-pending accrual and accrues the new amount under the
 * next revision (`…:r2`). A day that is already paid is never touched;
 * the difference is reported so the owner can add an adjustment.
 */
@Injectable()
export class StaffPieceworkService {
  private readonly log = new Logger(StaffPieceworkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
    private readonly payroll: PayrollAccrualsService,
    private readonly audit: AuditLogService,
  ) {}

  /** Computes one UTC day for everyone who worked (or was overturned). */
  async computeDay(
    day: string,
    opts: { onlyAdmin?: string; force?: boolean } = {},
  ): Promise<DayRunResult> {
    const { start, end } = dayBounds(day);
    const cfg = await this.staff.get();
    const q = {
      p90: cfg.numbers['staff.piecework.mult_90_pct'],
      p75: cfg.numbers['staff.piecework.mult_75_pct'],
      p60: cfg.numbers['staff.piecework.mult_60_pct'],
      low: cfg.numbers['staff.piecework.mult_low_pct'],
    };
    const boostMax = cfg.numbers['staff.piecework.boost_max_pct'];

    const result: DayRunResult = {
      day,
      admins: 0,
      accrued: 0,
      totalCents: 0,
      skippedNoPayroll: 0,
      skippedDisputed: 0,
      noRating: 0,
      paidDiffs: [],
    };

    const overturned = await this.overturnedByAdmin(start, end);
    const ids = opts.onlyAdmin
      ? [opts.onlyAdmin]
      : await this.candidates(start, end, overturned);
    if (ids.length === 0) return result;

    // Rates in force at the end of the day, one query for the whole run.
    const rates = await this.prisma.staffRate.findMany({
      where: {
        valid_from: { lte: end },
        OR: [{ valid_to: null }, { valid_to: { gt: end } }],
      },
      take: 1000,
    });

    for (let i = 0; i < ids.length; i += PIECEWORK_BATCH) {
      const batch = ids.slice(i, i + PIECEWORK_BATCH);
      const [profiles, units, snapshots, existing, employees] =
        await Promise.all([
          this.prisma.adminProfile.findMany({
            where: { user_id: { in: batch } },
            select: { user_id: true, workspace: true },
          }),
          this.prisma.workLeaseEvent.groupBy({
            by: ['admin_id', 'kind'],
            where: {
              admin_id: { in: batch },
              event: 'done',
              created_at: { gte: start, lt: end },
            },
            _count: { _all: true },
          }),
          this.prisma.staffRatingSnapshot.findMany({
            where: {
              admin_id: { in: batch },
              snapshot_date: {
                gte: new Date(start.getTime() - SNAPSHOT_LOOKBACK_DAYS * 864e5),
                lte: end,
              },
            },
            orderBy: [{ admin_id: 'asc' }, { snapshot_date: 'desc' }],
            distinct: ['admin_id'],
            select: { admin_id: true, rating: true, status: true },
          }),
          this.prisma.staffPieceworkDay.findMany({
            where: { admin_id: { in: batch }, day: start },
            select: {
              admin_id: true,
              kind: true,
              amount_cents: true,
              accrual_ref: true,
              status: true,
            },
          }),
          this.prisma.payrollEmployee.findMany({
            where: {
              active: true,
              OR: [
                { user_id: { in: batch } },
                { admin_user_id: { in: batch }, user_id: null },
              ],
            },
            select: {
              user_id: true,
              admin_user_id: true,
              name: true,
            },
          }),
        ]);

      const workspaceOf = new Map(profiles.map((p) => [p.user_id, p]));
      const unitsOf = new Map<string, Map<PieceworkKind, number>>();
      for (const u of units) {
        const kind = rateKindOf(u.kind);
        if (!kind || !u.admin_id) continue;
        addTo(unitsOf, u.admin_id, kind, u._count._all);
      }
      const snapshotOf = new Map(snapshots.map((s) => [s.admin_id, s]));
      const rowsOf = groupRows(existing);
      const employeeOf = new Map<string, string>();
      for (const e of employees) {
        // Same resolution as PayrollAccrualsService: the account itself,
        // else an employee linked by the admin account and not yet bound.
        if (e.user_id && batch.includes(e.user_id)) {
          employeeOf.set(e.user_id, e.name);
        } else if (e.admin_user_id && !employeeOf.has(e.admin_user_id)) {
          employeeOf.set(e.admin_user_id, e.name);
        }
      }

      for (const adminId of batch) {
        const profile = workspaceOf.get(adminId);
        if (!profile) continue; // not an admin (any more)
        const prev = rowsOf.get(adminId) ?? [];
        result.admins += 1;
        if (!opts.force && prev.some((r) => r.status === 'disputed')) {
          result.skippedDisputed += 1;
          continue;
        }
        const quality = qualityFor(snapshotOf.get(adminId) ?? null, q);
        const lines = buildLines(
          unitsOf.get(adminId),
          overturned.get(adminId),
          profile.workspace,
          rates,
          end,
          boostMax,
          quality.pct,
        );
        // Nothing counted (also: the journals aged out on an old re-run):
        // never wipe a recorded day.
        if (lines.length === 0) continue;
        const total = lines.reduce((s, l) => s + l.amountCents, 0);
        const name = employeeOf.get(adminId);
        const settle = await this.settle({
          adminId,
          day,
          total,
          prev,
          employeeName: name ?? null,
        });
        const status: DayStatus = dayStatus({
          totalCents: total,
          noRating: quality.noRating,
          onPayroll: name !== undefined || settle.ref !== null,
        });
        await this.replaceRows(adminId, start, lines, {
          qualityPct: quality.pct,
          status,
          ref: settle.ref,
        });
        if (quality.noRating && lines.length > 0) result.noRating += 1;
        if (name === undefined && settle.ref === null && total !== 0) {
          result.skippedNoPayroll += 1;
          this.log.warn(
            `piecework ${day}: ${adminId} is not on payroll, ${total} cents recorded, not accrued`,
          );
        }
        if (settle.paidDeltaCents !== null) {
          result.paidDiffs.push({
            adminId,
            deltaCents: settle.paidDeltaCents,
          });
        }
        if (settle.changed) {
          result.accrued += 1;
          result.totalCents += total;
        }
      }
    }
    return result;
  }

  /** The owner holds one person's day: its pending accrual is canceled so
   * it is not paid, the rows say «disputed», the nightly run leaves it. */
  async dispute(
    actor: AdminActor,
    adminId: string,
    day: string,
    reason: string,
  ): Promise<{ status: 'disputed'; accrual: 'canceled' | 'paid' | 'none' }> {
    const { start } = this.checkedDay(day, true);
    const rows = await this.prisma.staffPieceworkDay.findMany({
      where: { admin_id: adminId, day: start },
      select: {
        admin_id: true,
        kind: true,
        amount_cents: true,
        accrual_ref: true,
        status: true,
      },
    });
    if (rows.length === 0) throw notFound();
    const ref = rows.find((r) => r.accrual_ref)?.accrual_ref ?? null;
    let accrual: 'canceled' | 'paid' | 'none' = 'none';
    if (ref) {
      const r = await this.payroll.cancel(ref, `спор: ${reason}`.slice(0, 200));
      accrual = r === 'paid' ? 'paid' : 'canceled';
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.staffPieceworkDay.updateMany({
        where: { admin_id: adminId, day: start },
        data: { status: 'disputed' },
      });
      await this.audit.record(
        {
          adminId: actor.id,
          action: 'staff.piecework_dispute',
          targetType: 'staff_piecework_day',
          targetId: adminId,
          before: { day, statuses: rows.map((r) => r.status) },
          after: { day, status: 'disputed', accrual, reason },
          ip: actor.ip,
        },
        tx,
      );
    });
    return { status: 'disputed', accrual };
  }

  /** The owner recounts one person's day now (also lifts a dispute). */
  async rerun(
    actor: AdminActor,
    adminId: string,
    day: string,
  ): Promise<DayRunResult> {
    this.checkedDay(day, true);
    const res = await this.computeDay(day, { onlyAdmin: adminId, force: true });
    if (res.admins === 0) throw notFound();
    await this.audit.record({
      adminId: actor.id,
      action: 'staff.piecework_rerun',
      targetType: 'staff_piecework_day',
      targetId: adminId,
      after: { ...res },
      ip: actor.ip,
    });
    return res;
  }

  /** Validates a YYYY-MM-DD path value; a day not yet finished (today or
   * later) cannot be counted. */
  private checkedDay(day: string, finished: boolean): { start: Date } {
    if (!isDay(day)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Day must be YYYY-MM-DD.',
      });
    }
    const { start } = dayBounds(day);
    if (finished && start.getTime() >= startOfTodayUtc().getTime()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Only a finished day can be counted.',
      });
    }
    return { start };
  }

  /** Verdict «different» / «worse» that arrived in the day, per person and
   * rate kind. Bounded by the indexed (status, created_at) window. */
  private async overturnedByAdmin(
    start: Date,
    end: Date,
  ): Promise<Map<string, Map<PieceworkKind, number>>> {
    const rows = await this.prisma.staffReviewSample.groupBy({
      by: ['decided_by', 'decision_kind'],
      where: {
        status: 'done',
        verdict: { in: ['different', 'worse'] },
        is_golden: false,
        created_at: {
          gte: new Date(start.getTime() - SAMPLE_WINDOW_DAYS * 864e5),
        },
        done_at: { gte: start, lt: end },
      },
      _count: { _all: true },
    });
    const out = new Map<string, Map<PieceworkKind, number>>();
    for (const r of rows) {
      const kind = rateKindOf(r.decision_kind);
      if (kind) addTo(out, r.decided_by, kind, r._count._all);
    }
    return out;
  }

  /** Who to count: the people with decisions in `staff_daily_stats` for the
   * day plus anyone overturned that day. When the stats of the day are not
   * there yet, the day's `done` lease events name the people instead. */
  private async candidates(
    start: Date,
    end: Date,
    overturned: Map<string, unknown>,
  ): Promise<string[]> {
    const stats = await this.prisma.staffDailyStat.findMany({
      where: { day: start, decided: { gt: 0 } },
      select: { admin_id: true },
      take: 20_000,
    });
    const ids = new Set(stats.map((s) => s.admin_id));
    if (ids.size === 0) {
      const done = await this.prisma.workLeaseEvent.groupBy({
        by: ['admin_id'],
        where: {
          event: 'done',
          admin_id: { not: null },
          created_at: { gte: start, lt: end },
        },
      });
      for (const d of done) if (d.admin_id) ids.add(d.admin_id);
    }
    for (const id of overturned.keys()) ids.add(id);
    return [...ids];
  }

  /** Creates, keeps or re-issues the person's accrual for the day. */
  private async settle(opts: {
    adminId: string;
    day: string;
    total: number;
    prev: DayRow[];
    employeeName: string | null;
  }): Promise<Settle> {
    const { adminId, day, total, prev, employeeName } = opts;
    const prevRef = prev.find((r) => r.accrual_ref)?.accrual_ref ?? null;
    const prevTotal = prev.reduce((s, r) => s + r.amount_cents, 0);
    const wasDisputed = prev.some((r) => r.status === 'disputed');
    // Not on payroll: the day is recorded, no money moves.
    if (employeeName === null) {
      return { ref: prevRef, changed: false, paidDeltaCents: null };
    }
    if (prevRef === null) {
      if (total === 0)
        return { ref: null, changed: false, paidDeltaCents: null };
      const ref = accrualRef(adminId, day);
      const res = await this.payroll.accrue(
        this.accrual(adminId, employeeName, ref, total, day),
      );
      return { ref, changed: res.created, paidDeltaCents: null };
    }
    if (!wasDisputed && total === prevTotal) {
      return { ref: prevRef, changed: false, paidDeltaCents: null };
    }
    const taken = await this.payroll.cancel(
      prevRef,
      'пересчёт сдельной оплаты',
    );
    if (taken === 'paid') {
      // Money already left: never rewrite it, tell the owner the difference.
      return {
        ref: prevRef,
        changed: false,
        paidDeltaCents: total - prevTotal,
      };
    }
    if (total === 0)
      return { ref: prevRef, changed: false, paidDeltaCents: null };
    const ref = nextAccrualRef(prevRef);
    const res = await this.payroll.accrue(
      this.accrual(adminId, employeeName, ref, total, day),
    );
    return { ref, changed: res.created, paidDeltaCents: null };
  }

  private accrual(
    adminId: string,
    name: string,
    ref: string,
    total: number,
    day: string,
  ) {
    return {
      userId: adminId,
      name,
      source: 'admin',
      eventRef: ref,
      amountCents: total,
      currency: PIECEWORK_CURRENCY,
      period: day.slice(0, 7),
      kind: total < 0 ? ('adjustment' as const) : ('bonus' as const),
      note: `Сдельная оплата за ${day}`,
    };
  }

  /** Re-run replaces: the person's rows of the day are swapped as a whole. */
  private async replaceRows(
    adminId: string,
    start: Date,
    lines: Line[],
    meta: { qualityPct: number; status: DayStatus; ref: string | null },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.staffPieceworkDay.deleteMany({
        where: { admin_id: adminId, day: start },
      }),
      ...(lines.length > 0
        ? [
            this.prisma.staffPieceworkDay.createMany({
              data: lines.map((l) => ({
                admin_id: adminId,
                day: start,
                kind: l.kind,
                units: l.units,
                held_units: l.held,
                rate_cents: l.rateCents,
                quality_mult: (meta.qualityPct / 100).toFixed(2),
                amount_cents: l.amountCents,
                currency: PIECEWORK_CURRENCY,
                accrual_ref: meta.ref,
                status: meta.status,
              })),
            }),
          ]
        : []),
    ]);
  }
}

function buildLines(
  units: Map<PieceworkKind, number> | undefined,
  overturned: Map<PieceworkKind, number> | undefined,
  workspace: AdminWorkspace,
  rates: Parameters<typeof pickRate>[0],
  at: Date,
  boostMaxPct: number,
  qualityPct: number,
): Line[] {
  const kinds = new Set<PieceworkKind>([
    ...(units?.keys() ?? []),
    ...(overturned?.keys() ?? []),
  ]);
  const out: Line[] = [];
  for (const kind of [...kinds].sort()) {
    const u = units?.get(kind) ?? 0;
    const held = overturned?.get(kind) ?? 0;
    const rate = pickRate(rates, kind, workspace, at);
    const rateCents = rate ? effectiveRateCents(rate, boostMaxPct) : 0;
    out.push({
      kind,
      units: u,
      held,
      rateCents,
      amountCents: lineAmountCents(u, held, rateCents, qualityPct),
    });
  }
  return out;
}

function addTo(
  m: Map<string, Map<PieceworkKind, number>>,
  adminId: string,
  kind: PieceworkKind,
  n: number,
): void {
  const inner = m.get(adminId) ?? new Map<PieceworkKind, number>();
  inner.set(kind, (inner.get(kind) ?? 0) + n);
  m.set(adminId, inner);
}

function groupRows(rows: DayRow[]): Map<string, DayRow[]> {
  const m = new Map<string, DayRow[]>();
  for (const r of rows) {
    const list = m.get(r.admin_id) ?? [];
    list.push(r);
    m.set(r.admin_id, list);
  }
  return m;
}

function startOfTodayUtc(): Date {
  const n = new Date();
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()),
  );
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });
}
