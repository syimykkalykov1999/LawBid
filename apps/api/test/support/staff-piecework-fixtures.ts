/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
/**
 * Test double of the few Prisma delegates the piecework run and the payroll
 * accrual service touch, over plain arrays. Spec-only (not imported by the
 * app): the REAL PayrollAccrualsService runs on top of it, so the specs
 * prove what really lands in payroll_accruals.
 */
import type { AppSettingsService } from '../../src/common/app-settings/app-settings.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { PayrollAccrualsService } from '../../src/modules/admin-payroll/payroll-accruals.service';
import type { AdminActor } from '../../src/modules/admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../../src/modules/staff-core/staff-settings.service';
import { StaffPieceworkService } from '../../src/modules/staff-piecework/staff-piecework.service';

export interface Fx {
  rates: Array<Record<string, unknown>>;
  profiles: Array<{ user_id: string; workspace: string }>;
  stats: Array<{ admin_id: string }>;
  leaseDone: Array<{ admin_id: string; kind: string }>;
  overturned: Array<{ decided_by: string; decision_kind: string; n: number }>;
  snapshots: Array<{ admin_id: string; rating: number | null; status: string }>;
  days: Array<Record<string, any>>;
  employees: Array<Record<string, any>>;
  accruals: Array<Record<string, any>>;
}

export const DAY = '2026-10-26';
export const DAY_START = new Date(`${DAY}T00:00:00.000Z`);
export const A1 = '11111111-1111-4111-8111-111111111111';
export const A2 = '22222222-2222-4222-8222-222222222222';

export function emptyFx(): Fx {
  return {
    rates: [],
    profiles: [],
    stats: [],
    leaseDone: [],
    overturned: [],
    snapshots: [],
    days: [],
    employees: [],
    accruals: [],
  };
}

export function rate(
  kind: string,
  amount_cents: number,
  over: Record<string, unknown> = {},
) {
  return {
    id: `rate-${kind}`,
    kind,
    workspace: 'mass',
    amount_cents,
    currency: 'usd',
    valid_from: new Date('2026-10-01T00:00:00Z'),
    valid_to: null,
    boost_mult: null,
    created_by: A1,
    ...over,
  };
}

export function done(admin_id: string, kind: string, n: number) {
  return Array.from({ length: n }, () => ({ admin_id, kind }));
}

export function makeDb(fx: Fx) {
  let seq = 0;
  const inList = (w: any, v: string) => !w?.in || w.in.includes(v);
  const db: any = {
    staffRate: { findMany: async () => fx.rates },
    adminProfile: {
      findMany: async ({ where }: any) =>
        fx.profiles.filter((p) => inList(where.user_id, p.user_id)),
    },
    staffDailyStat: { findMany: async () => fx.stats },
    workLeaseEvent: {
      groupBy: async ({ by, where }: any) => {
        const rows = fx.leaseDone.filter((r) =>
          inList(where.admin_id, r.admin_id),
        );
        const out = new Map<string, any>();
        for (const r of rows) {
          const key = by.map((b: string) => (r as any)[b]).join('|');
          const cur = out.get(key) ?? {
            ...Object.fromEntries(by.map((b: string) => [b, (r as any)[b]])),
            _count: { _all: 0 },
          };
          cur._count._all += 1;
          out.set(key, cur);
        }
        return [...out.values()];
      },
    },
    staffReviewSample: {
      groupBy: async () =>
        fx.overturned.map((o) => ({
          decided_by: o.decided_by,
          decision_kind: o.decision_kind,
          _count: { _all: o.n },
        })),
    },
    staffRatingSnapshot: {
      findMany: async ({ where }: any) =>
        fx.snapshots.filter((s) => inList(where.admin_id, s.admin_id)),
    },
    staffPieceworkDay: {
      findMany: async ({ where }: any) =>
        fx.days.filter(
          (d) =>
            inList(where.admin_id, d.admin_id) &&
            (!where.day || d.day.getTime() === where.day.getTime()),
        ),
      deleteMany: async ({ where }: any) => {
        const before = fx.days.length;
        fx.days = fx.days.filter(
          (d) =>
            !(
              d.admin_id === where.admin_id &&
              d.day.getTime() === where.day.getTime()
            ),
        );
        return { count: before - fx.days.length };
      },
      createMany: async ({ data }: any) => {
        fx.days.push(
          ...data.map((d: any) => ({ ...d, quality_mult: d.quality_mult })),
        );
        return { count: data.length };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const d of fx.days) {
          if (
            d.admin_id === where.admin_id &&
            d.day.getTime() === where.day.getTime()
          ) {
            Object.assign(d, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    payrollEmployee: {
      findMany: async () => fx.employees.filter((e) => e.active),
      findUnique: async ({ where }: any) =>
        fx.employees.find((e) => e.user_id === where.user_id) ?? null,
      findFirst: async ({ where }: any) =>
        fx.employees.find(
          (e) => e.admin_user_id === where.admin_user_id && e.user_id === null,
        ) ?? null,
      update: async ({ where, data }: any) => {
        const e = fx.employees.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        return e;
      },
      create: async ({ data }: any) => {
        const e = {
          id: `emp-${++seq}`,
          active: true,
          currency: 'usd',
          ...data,
        };
        fx.employees.push(e);
        return e;
      },
    },
    payrollAccrual: {
      findUnique: async ({ where }: any) =>
        fx.accruals.find((a) => a.event_ref === where.event_ref) ?? null,
      findUniqueOrThrow: async ({ where }: any) =>
        fx.accruals.find((a) => a.event_ref === where.event_ref),
      create: async ({ data }: any) => {
        const a = { id: `acc-${++seq}`, status: 'pending', ...data };
        fx.accruals.push(a);
        return a;
      },
      updateMany: async ({ where, data }: any) => {
        const a = fx.accruals.find(
          (x) => x.id === where.id && x.status === where.status,
        );
        if (a) Object.assign(a, data);
        return { count: a ? 1 : 0 };
      },
    },
    $transaction: async (arg: any) =>
      typeof arg === 'function' ? arg(db) : Promise.all(arg),
  };
  return db as PrismaService;
}

export const OWNER = {
  id: 'owner-1',
  adminRole: 'super_admin',
  sessionId: 's1',
  justification: null,
  ip: '127.0.0.1',
} as unknown as AdminActor;

export function makeService(
  fx: Fx,
  stored: Record<string, unknown> = { 'staff.piecework_enabled': true },
) {
  const prisma = makeDb(fx);
  const settings = new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);
  const payroll = new PayrollAccrualsService(prisma);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new StaffPieceworkService(
    prisma,
    settings,
    payroll,
    audit as never,
  );
  return { svc, prisma, settings, payroll, audit };
}

/** A person with a profile, stats for the day and a payroll entry. */
export function withPerson(
  fx: Fx,
  id: string,
  opts: { payroll?: boolean } = {},
) {
  fx.profiles.push({ user_id: id, workspace: 'mass' });
  fx.stats.push({ admin_id: id });
  if (opts.payroll !== false) {
    fx.employees.push({
      id: `emp-of-${id}`,
      user_id: null,
      admin_user_id: id,
      name: `Person ${id.slice(0, 2)}`,
      currency: 'usd',
      active: true,
    });
  }
}
