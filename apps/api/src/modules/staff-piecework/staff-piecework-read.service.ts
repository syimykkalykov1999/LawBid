import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type {
  PieceworkDayDto,
  PieceworkOverviewDto,
  PieceworkPersonDto,
} from './staff-piecework.dto';
import { PIECEWORK_CURRENCY } from './staff-piecework.service';

/** One month of one workspace is far below this; a safety stop. */
const ROW_CAP = 20_000;

type DayRow = {
  admin_id: string;
  day: Date;
  kind: string;
  units: number;
  held_units: number;
  rate_cents: number;
  quality_mult: { toString(): string };
  amount_cents: number;
  status: string;
};

/**
 * Staff package T7: the read side, from the stored `staff_piecework_days`
 * only (at most two queries per request, no recount from the journals):
 *  - owner (super admin): everyone, every day with the rate used per kind;
 *  - head of a workspace: that workspace's people, month totals only —
 *    no rates, no per-person money, no day lines;
 *  - everyone else: their own days (their own pay, no rates).
 * Anything else, and everything while `staff.piecework_enabled` is off,
 * answers 404 like a section that does not exist.
 */
@Injectable()
export class StaffPieceworkReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffSettingsService,
  ) {}

  /** 404 while the piecework switch is off (the default). */
  async assertEnabled(): Promise<void> {
    if (!(await this.staff.isOn('staff.piecework_enabled'))) throw notFound();
  }

  async overview(
    actor: AdminActor,
    period?: string,
    now = new Date(),
  ): Promise<PieceworkOverviewDto> {
    await this.assertEnabled();
    const month = period ?? now.toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    const range = { gte: from, lt: to };

    const owner = actor.adminRole === 'super_admin';
    const head = !owner && actor.workspaceHead === true && !!actor.workspace;
    const scope = owner ? 'owner' : head ? 'head' : 'self';

    let rows: DayRow[];
    let people: Array<{
      user_id: string;
      workspace: string;
      user: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      };
    }>;
    const select = {
      user_id: true,
      workspace: true,
      user: { select: { first_name: true, last_name: true, email: true } },
    } as const;
    if (head) {
      // Query 1: the workspace's people; query 2: their days.
      people = await this.prisma.adminProfile.findMany({
        where: { workspace: actor.workspace },
        select,
        take: 2000,
      });
      rows = await this.prisma.staffPieceworkDay.findMany({
        where: {
          day: range,
          admin_id: { in: people.map((p) => p.user_id) },
        },
        take: ROW_CAP,
      });
    } else {
      // Query 1: the days (all for the owner, own for everyone else);
      // query 2: the names of the people in them.
      rows = await this.prisma.staffPieceworkDay.findMany({
        where: { day: range, ...(owner ? {} : { admin_id: actor.id }) },
        orderBy: { day: 'asc' },
        take: ROW_CAP,
      });
      const ids = [...new Set(rows.map((r) => r.admin_id))];
      people = ids.length
        ? await this.prisma.adminProfile.findMany({
            where: { user_id: { in: ids } },
            select,
          })
        : [];
    }

    const byAdmin = new Map<string, DayRow[]>();
    for (const r of rows) {
      const list = byAdmin.get(r.admin_id) ?? [];
      list.push(r);
      byAdmin.set(r.admin_id, list);
    }

    const out: PieceworkPersonDto[] = [];
    for (const p of people) {
      const mine = byAdmin.get(p.user_id) ?? [];
      if (mine.length === 0 && head) continue;
      const days = dayLines(mine, owner);
      const units = sum(days, (d) => d.units);
      const held = sum(days, (d) => d.heldUnits);
      const money = sum(days, (d) => d.amountCents);
      out.push({
        adminId: p.user_id,
        name: displayName(p.user),
        workspace: p.workspace,
        units,
        heldUnits: held,
        amountCents: head ? null : money,
        days: head ? [] : days,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    const shown = new Set(out.map((p) => p.adminId));
    return {
      period: month,
      scope,
      currency: PIECEWORK_CURRENCY,
      totals: {
        people: out.length,
        units: sum(out, (p) => p.units),
        heldUnits: sum(out, (p) => p.heldUnits),
        // A head sees the workspace total, not who earns what.
        amountCents: sum(
          rows.filter((r) => shown.has(r.admin_id)),
          (r) => r.amount_cents,
        ),
      },
      people: out,
    };
  }
}

/** Rows of one person (all kinds) → one line per day. */
function dayLines(rows: DayRow[], withKinds: boolean): PieceworkDayDto[] {
  const byDay = new Map<string, DayRow[]>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const status = list.some((r) => r.status === 'disputed')
        ? 'disputed'
        : list[0].status;
      return {
        day,
        units: sum(list, (r) => r.units),
        heldUnits: sum(list, (r) => r.held_units),
        qualityMult: Number(list[0].quality_mult),
        amountCents: sum(list, (r) => r.amount_cents),
        status,
        noRating: status === 'no_rating',
        kinds: withKinds
          ? list.map((r) => ({
              kind: r.kind,
              units: r.units,
              heldUnits: r.held_units,
              rateCents: r.rate_cents,
              amountCents: r.amount_cents,
            }))
          : null,
      };
    });
}

function sum<T>(list: readonly T[], f: (t: T) => number): number {
  return list.reduce((s, t) => s + f(t), 0);
}

function displayName(u: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}): string {
  const full = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
  return full || u.email || '—';
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });
}
