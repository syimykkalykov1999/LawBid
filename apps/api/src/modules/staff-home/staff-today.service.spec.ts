import type { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { RuleBasedRecommendationTemplate } from './staff-recommendation.template';
import { StaffTodayService } from './staff-today.service';

const settings = (stored: Record<string, unknown>) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

const ALL_ON = {
  'staff.owner_home_enabled': true,
  'staff.appeals_enabled': true,
  'staff.rating_enabled': true,
  'staff.suggestions_enabled': true,
  'staff.anomalies_enabled': true,
  'staff.piecework_enabled': true,
};

/** A prisma whose ONLY allowed call is $queryRaw; anything else fails. */
function prismaWith(rows: unknown[]) {
  const queryRaw = jest.fn().mockResolvedValue(rows);
  const prisma = new Proxy(
    { $queryRaw: queryRaw },
    {
      get: (t, p) => {
        if (p === 'then') return undefined;
        if (p in t) return t[p as keyof typeof t];
        throw new Error(`DB touched: ${String(p)}`);
      },
    },
  ) as unknown as PrismaService;
  return { prisma, queryRaw };
}

const summary = {
  get: (_k: string, compute: () => Promise<unknown>) =>
    compute().then((data) => ({
      data,
      computedAt: '2026-10-27T10:00:00.000Z',
    })),
  refresh: (_k: string, compute: () => Promise<unknown>) =>
    compute().then((data) => ({
      data,
      computedAt: '2026-10-27T10:00:00.000Z',
    })),
} as unknown as AdminSummaryService;

const build = (stored: Record<string, unknown>, rows: unknown[] = []) => {
  const { prisma, queryRaw } = prismaWith(rows);
  const svc = new StaffTodayService(
    prisma,
    settings(stored),
    summary,
    new RuleBasedRecommendationTemplate(),
  );
  return { svc, queryRaw };
};

describe('StaffTodayService (the owner «Сегодня»)', () => {
  it('every block off: no query at all, every block null', async () => {
    const { svc, queryRaw } = build({});
    const t = await svc.build();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(t).toMatchObject({
      decision: null,
      appeals: null,
      flags: null,
      shortlist: null,
      suggestions: null,
      anomalies: null,
      piecework: null,
    });
  });

  it('all blocks on: exactly ONE query, no other table call', async () => {
    const { svc, queryRaw } = build(ALL_ON);
    await svc.build();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('builds the blocks from the rows and picks the decision of the day', async () => {
    const { svc } = build(ALL_ON, [
      {
        t: 'appeal',
        d: {
          id: 'p1',
          number: 7,
          kind: 'pressure',
          status: 'new',
          createdAt: '2026-10-26T08:00:00+00:00',
          first: 'Олег',
          last: 'Главный',
          total: 2,
        },
      },
      { t: 'flags', d: { open: 0 } },
      {
        t: 'worst',
        d: {
          adminId: 'w1',
          workspace: 'mass',
          rating: 52,
          status: 'red',
          flags: ['very_low'],
          decisions: 90,
          snapshotDate: '2026-10-27',
          first: 'Пётр',
          last: null,
        },
      },
      {
        t: 'best',
        d: {
          adminId: 'b1',
          workspace: 'mass',
          rating: 97,
          status: 'green',
          flags: [],
          decisions: 200,
          snapshotDate: '2026-10-27',
          first: 'Анна',
          last: 'С',
        },
      },
      {
        t: 'suggestion',
        d: {
          id: 's1',
          adminId: 'w1',
          workspace: 'mass',
          kind: 'pull',
          evidence: { rating: 52, n: 90, flags: ['very_low'] },
          createdAt: '2026-10-27T01:00:00+00:00',
          first: 'Пётр',
          last: null,
          total: 4,
        },
      },
      {
        t: 'anomaly',
        d: {
          adminId: 'w1',
          rule: 'too_fast',
          score: 12,
          day: '2026-10-27',
          first: 'Пётр',
          last: null,
          total: 3,
        },
      },
      { t: 'piecework', d: { disputed: 1 } },
    ]);
    const t = await svc.build();
    expect(t.appeals).toEqual({
      open: 2,
      newest: [
        expect.objectContaining({ number: 7, headName: 'Олег Главный' }),
      ],
    });
    expect(t.flags).toEqual({ open: 0 });
    expect(t.shortlist?.worst[0]).toMatchObject({
      name: 'Пётр',
      status: 'red',
    });
    expect(t.shortlist?.best[0].rating).toBe(97);
    expect(t.shortlist?.snapshotDate).toBe('2026-10-27');
    expect(t.suggestions).toMatchObject({ open: 4 });
    expect(t.suggestions?.items[0].recommendation.adviceLabel).toBe('Заменить');
    expect(t.anomalies).toMatchObject({ day: '2026-10-27', total: 3 });
    expect(t.anomalies?.items[0].ruleLabel).toBe('решает слишком быстро');
    expect(t.piecework).toEqual({ disputedDays: 1 });
    // the complaint outranks the removal suggestion
    expect(t.decision?.code).toBe('appeal');
  });

  it('a complaint about a head never carries the author', async () => {
    const { svc } = build({ 'staff.appeals_enabled': true }, [
      {
        t: 'appeal',
        d: {
          id: 'p1',
          number: 1,
          kind: 'other',
          status: 'new',
          createdAt: '2026-10-26T08:00:00+00:00',
          first: 'Олег',
          last: null,
          total: 1,
          author_id: 'SECRET',
        },
      },
      { t: 'flags', d: { open: 1 } },
    ]);
    const t = await svc.build();
    expect(JSON.stringify(t)).not.toContain('SECRET');
    expect(t.decision?.code).toBe('retaliation_flag');
  });

  it('the suggestions block needs rating AND suggestions on', async () => {
    const { svc, queryRaw } = build({ 'staff.suggestions_enabled': true });
    const t = await svc.build();
    expect(t.suggestions).toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('read/refresh return the stored snapshot with its time', async () => {
    const { svc } = build(ALL_ON);
    expect((await svc.read()).computedAt).toBe('2026-10-27T10:00:00.000Z');
    expect((await svc.refresh()).computedAt).toBe('2026-10-27T10:00:00.000Z');
  });
});
