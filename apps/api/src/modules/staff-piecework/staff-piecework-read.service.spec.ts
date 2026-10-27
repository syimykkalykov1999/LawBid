/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import { NotFoundException } from '@nestjs/common';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffPieceworkReadService } from './staff-piecework-read.service';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-27T10:00:00Z');

const day = (d: string, admin: string, kind: string, over = {}) => ({
  admin_id: admin,
  day: new Date(`${d}T00:00:00Z`),
  kind,
  units: 4,
  held_units: 1,
  rate_cents: 250,
  quality_mult: '1.10',
  amount_cents: 825,
  status: 'accrued',
  ...over,
});
const person = (id: string, workspace: string, first: string) => ({
  user_id: id,
  workspace,
  user: { first_name: first, last_name: null, email: `${first}@x.test` },
});

function make(on = true) {
  const rows = [
    day('2026-10-25', A, 'ticket'),
    day('2026-10-25', A, 'verification', {
      rate_cents: 500,
      amount_cents: 1650,
    }),
    day('2026-10-26', A, 'ticket', {
      status: 'no_rating',
      quality_mult: '1.00',
    }),
    day('2026-10-26', B, 'ticket'),
    day('2026-10-26', C, 'ticket'),
  ];
  const profiles = [
    person(A, 'mass', 'Anna'),
    person(B, 'mass', 'Boris'),
    person(C, 'finance', 'Clara'),
  ];
  const stat = { n: 0 };
  const prisma = {
    staffPieceworkDay: {
      findMany: jest.fn(async ({ where }: any) => {
        stat.n += 1;
        return rows.filter(
          (r) =>
            (!where.admin_id ||
              (typeof where.admin_id === 'string'
                ? r.admin_id === where.admin_id
                : where.admin_id.in.includes(r.admin_id))) &&
            r.day >= where.day.gte &&
            r.day < where.day.lt,
        );
      }),
    },
    adminProfile: {
      findMany: jest.fn(async ({ where }: any) => {
        stat.n += 1;
        return profiles.filter((p) =>
          where.workspace
            ? p.workspace === where.workspace
            : where.user_id.in.includes(p.user_id),
        );
      }),
    },
  };
  const svc = new StaffPieceworkReadService(
    prisma as unknown as PrismaService,
    new StaffSettingsService({
      all: () => Promise.resolve(on ? { 'staff.piecework_enabled': true } : {}),
    } as unknown as AppSettingsService),
  );
  return { svc, stat };
}

const actor = (over: Partial<AdminActor>): AdminActor => ({
  id: A,
  adminRole: 'moderator',
  sessionId: 's',
  justification: null,
  ip: null,
  workspace: 'mass',
  workspaceHead: false,
  ...over,
});

describe('StaffPieceworkReadService scoping', () => {
  it('owner: everyone, day lines with the rate per kind, month totals', async () => {
    const { svc, stat } = make();
    const out = await svc.overview(
      actor({ id: 'o', adminRole: 'super_admin', workspace: 'owner' }),
      '2026-10',
      NOW,
    );
    expect(out.scope).toBe('owner');
    expect(out.people.map((p) => p.name)).toEqual(['Anna', 'Boris', 'Clara']);
    const anna = out.people[0];
    expect(anna).toMatchObject({ units: 12, heldUnits: 3, amountCents: 3300 });
    expect(anna.days[0].kinds).toEqual([
      expect.objectContaining({ kind: 'ticket', rateCents: 250 }),
      expect.objectContaining({ kind: 'verification', rateCents: 500 }),
    ]);
    expect(anna.days[1]).toMatchObject({ noRating: true, qualityMult: 1 });
    expect(out.totals).toMatchObject({
      people: 3,
      amountCents: 3300 + 825 * 2,
    });
    expect(stat.n).toBeLessThanOrEqual(3);
  });

  it('head: own workspace only, totals only (no rates, no per-person money, no days)', async () => {
    const { svc, stat } = make();
    const out = await svc.overview(
      actor({ id: B, workspaceHead: true }),
      '2026-10',
      NOW,
    );
    expect(out.scope).toBe('head');
    expect(out.people.map((p) => p.name)).toEqual(['Anna', 'Boris']);
    for (const p of out.people) {
      expect(p.amountCents).toBeNull();
      expect(p.days).toEqual([]);
    }
    expect(JSON.stringify(out)).not.toContain('rateCents');
    expect(out.totals.amountCents).toBe(3300 + 825);
    expect(stat.n).toBeLessThanOrEqual(3);
  });

  it('worker: only their own days, own money, no rates', async () => {
    const { svc, stat } = make();
    const out = await svc.overview(actor({ id: B }), '2026-10', NOW);
    expect(out.scope).toBe('self');
    expect(out.people).toHaveLength(1);
    expect(out.people[0]).toMatchObject({ adminId: B, amountCents: 825 });
    expect(out.people[0].days[0].kinds).toBeNull();
    expect(JSON.stringify(out)).not.toContain('rateCents');
    expect(JSON.stringify(out)).not.toContain('Anna');
    expect(stat.n).toBeLessThanOrEqual(3);
  });

  it('a head of another workspace does not see this one', async () => {
    const { svc } = make();
    const out = await svc.overview(
      actor({ id: C, workspace: 'finance', workspaceHead: true }),
      '2026-10',
      NOW,
    );
    expect(out.people.map((p) => p.name)).toEqual(['Clara']);
  });

  it('defaults to the current month and 404s everywhere while the switch is off', async () => {
    const { svc } = make();
    const out = await svc.overview(actor({ id: B }), undefined, NOW);
    expect(out.period).toBe('2026-10');
    const off = make(false).svc;
    for (const a of [
      actor({ id: 'o', adminRole: 'super_admin' }),
      actor({ workspaceHead: true }),
      actor({}),
    ]) {
      await expect(off.overview(a, '2026-10', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });

  it('an empty month is an empty answer, still within the query budget', async () => {
    const { svc, stat } = make();
    const out = await svc.overview(actor({ id: B }), '2026-09', NOW);
    expect(out.people).toEqual([]);
    expect(out.totals).toMatchObject({ people: 0, amountCents: 0 });
    expect(stat.n).toBeLessThanOrEqual(3);
  });
});
