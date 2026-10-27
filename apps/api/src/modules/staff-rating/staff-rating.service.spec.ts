import type { PrismaService } from '../../prisma/prisma.service';
import { StaffRatingService } from './staff-rating.service';
import { RATING_ON, settingsOf } from './staff-rating.test-support';

const NOW = new Date('2026-10-27T01:40:00Z');
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const sum = (o: Record<string, number>) => ({
  decided: 0,
  reopened: 0,
  complaints: 0,
  csat_up: 0,
  csat_down: 0,
  sampled: 0,
  sample_diff: 0,
  golden_total: 0,
  golden_fail: 0,
  too_fast: 0,
  late_sla: 0,
  lease_lost: 0,
  ...o,
});

/** Fixture: 40 decisions each for a good and a poor worker, 12 for a newcomer. */
function make(
  stored: Record<string, unknown> = RATING_ON,
  extra: { warns?: object[] } = {},
) {
  const sums = [
    { admin_id: id(1), _sum: sum({ decided: 40, sampled: 4, sample_diff: 0 }) },
    {
      admin_id: id(2),
      _sum: sum({
        decided: 40,
        sampled: 4,
        sample_diff: 3,
        reopened: 6,
        complaints: 4,
      }),
    },
    { admin_id: id(3), _sum: sum({ decided: 12 }) },
  ];
  const written: unknown[][] = [];
  const created: Array<{ data: Array<Record<string, unknown>> }> = [];
  const prisma = {
    staffDailyStat: {
      groupBy: jest.fn((a: { by: string[]; where: { day: { gte: Date } } }) =>
        Promise.resolve(
          a.where.day.gte.getTime() ===
            new Date('2026-09-27T00:00:00Z').getTime()
            ? sums
            : [],
        ),
      ),
    },
    staffQualitySignal: { groupBy: jest.fn(() => Promise.resolve([])) },
    staffAnomaly: { findMany: jest.fn(() => Promise.resolve([])) },
    staffMemberState: { findMany: jest.fn(() => Promise.resolve([])) },
    adminProfile: {
      findMany: jest.fn(() =>
        Promise.resolve(
          [1, 2, 3].map((n) => ({ user_id: id(n), workspace: 'mass' })),
        ),
      ),
    },
    staffRatingSnapshot: { findMany: jest.fn(() => Promise.resolve([])) },
    staffSuggestion: {
      findMany: jest.fn((a: { where: { snapshot_date?: unknown } }) =>
        Promise.resolve(
          a.where.snapshot_date ? [{ admin_id: id(2) }] : (extra.warns ?? []),
        ),
      ),
      createMany: jest.fn((a: { data: Array<Record<string, unknown>> }) => {
        created.push(a);
        return Promise.resolve({ count: a.data.length });
      }),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    staffAction: { createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    $queryRaw: jest.fn(() => Promise.resolve([])),
    $executeRaw: jest.fn((...args: unknown[]) => {
      written.push(args);
      return Promise.resolve(1);
    }),
  };
  const svc = new StaffRatingService(
    prisma as unknown as PrismaService,
    settingsOf(stored),
  );
  return { svc, prisma, written, created };
}

describe('StaffRatingService.runNightly (fixtures)', () => {
  it('builds a snapshot per person: a rating, «мало данных» under 30, flags', async () => {
    const { svc, written } = make();
    const r = await svc.runNightly(NOW);
    expect(r).toEqual({
      date: '2026-10-27',
      rated: 2,
      lowData: 1,
      suggestions: expect.any(Number),
    });
    // one upsert holding all three people
    const bound = JSON.stringify(written[0].slice(1));
    for (const n of [1, 2, 3]) expect(bound).toContain(id(n));
  });

  it('a re-run of the same night writes the same rows (idempotent)', async () => {
    const a = make();
    const b = make();
    await a.svc.runNightly(NOW);
    await b.svc.runNightly(NOW);
    await a.svc.runNightly(NOW);
    const snap = (m: ReturnType<typeof make>, i: number) =>
      JSON.stringify(m.written[i].slice(1));
    expect(snap(a, 0)).toBe(snap(b, 0));
    expect(snap(a, 1)).toBe(snap(a, 0));
    // upsert by (admin, date): a repeat never adds rows
    const text = (a.written[0][0] as string[]).join('?');
    expect(text).toContain('ON CONFLICT (admin_id, snapshot_date) DO UPDATE');
  });

  it('suggestions off (the default): the snapshot only', async () => {
    const { svc, prisma } = make({ 'staff.rating_enabled': true });
    const r = await svc.runNightly(NOW);
    expect(r.suggestions).toBe(0);
    expect(prisma.staffSuggestion.createMany).not.toHaveBeenCalled();
  });

  it('suggestions on: the poor worker gets a warning and more re-checks, left OPEN', async () => {
    const { svc, created } = make();
    await svc.runNightly(NOW);
    const rows = created[0].data;
    const mine = rows
      .filter((r) => r.admin_id === id(2))
      .map((r) => [r.kind, r.status]);
    expect(mine).toEqual(
      expect.arrayContaining([
        ['warn', 'open'],
        ['more_review', 'open'],
      ]),
    );
    expect(rows.every((r) => r.admin_id !== id(3))).toBe(true); // low data: nothing
    expect(rows.every((r) => r.admin_id !== id(1))).toBe(true); // fine: nothing
  });

  it('pull and replace are never auto-applied, even with auto-apply on', async () => {
    const dayAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
    const warns = [10, 20].map((d) => ({
      admin_id: id(2),
      kind: 'warn',
      status: 'applied',
      created_at: dayAgo(d),
    }));
    const { svc, created, prisma } = make(
      { ...RATING_ON, 'staff.auto_apply_enabled': true },
      { warns },
    );
    await svc.runNightly(NOW);
    const rows = created[0].data.filter((r) => r.admin_id === id(2));
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.status]));
    expect(byKind.warn).toBe('applied'); // the only auto-applied kind
    expect(byKind.replace).toBe('open'); // 2 earlier + this one = 3 in 60 days
    expect(
      rows.filter((r) => r.kind !== 'warn').every((r) => r.status === 'open'),
    ).toBe(true);
    expect(prisma.staffAction.createMany).toHaveBeenCalledTimes(1);
  });
});
