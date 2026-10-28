import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { CaseAudienceService } from './case-audience.service';

/**
 * Algo audit 2026-10-27 (CASES C-2): an attorney who never opened the
 * «Новые дела» toggle has no notification_settings row. Before, the
 * audience JOINed on that row, so such an attorney heard nothing (no push,
 * no bell row). Now a missing row counts as ON while
 * `case_alerts.default_enabled` is on; an explicit OFF row still excludes.
 * H-3: the urgency of a dated case is read in the client's time zone.
 */
const CASE = '11111111-1111-4111-8111-111111111111';

function make(opts: {
  defaultOn?: boolean;
  settingsRows?: { user_id: string; push_enabled: boolean }[];
  split?: boolean;
  clientTz?: string | null;
  deadline?: Date | null;
}) {
  const sql: string[] = [];
  const prisma = {
    case: {
      findUnique: jest.fn(({ select }: { select: Record<string, boolean> }) =>
        Promise.resolve(
          select.urgency
            ? {
                urgency: opts.deadline ? 'by_date' : 'flexible',
                deadline_at: opts.deadline ?? null,
                client_id: 'client-1',
              }
            : {
                client_id: 'client-1',
                practice_area_id: 'pa-1',
                primary_state_code: 'CA',
                states: [{ state_code: 'CA' }],
                extra_practices: [],
              },
        ),
      ),
    },
    user: {
      findUnique: jest.fn(() =>
        Promise.resolve({ timezone: opts.clientTz ?? null }),
      ),
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id }))),
      ),
    },
    practiceArea: {
      findUnique: jest.fn(() =>
        Promise.resolve({ parent_id: null, code: 'family.divorce' }),
      ),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    attorneyProfile: {
      findMany: jest.fn(() =>
        Promise.resolve(
          ['a1', 'a2', 'a3'].map((id) => ({
            user_id: id,
            trust_level: 1,
            rating_avg: 4,
            rating_count: 1,
            new_case_alerts_custom: false,
            new_case_alerts_urgent_only: id === 'a2',
            practice_areas: [{ practice_area_id: 'pa-1' }],
            new_case_alert_practices: [],
            licenses: [{ state_code: 'CA' }],
          })),
        ),
      ),
    },
    notificationSetting: {
      findMany: jest.fn(() => Promise.resolve(opts.settingsRows ?? [])),
    },
    userBlock: { findMany: jest.fn(() => Promise.resolve([])) },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- bound values are read from mock.calls
    $queryRaw: jest.fn((strings: TemplateStringsArray, ..._v: unknown[]) => {
      sql.push(strings.join('?'));
      return Promise.resolve([]);
    }),
    // readsAreSplit() looks at this flag.
    splitReads: opts.split ?? false,
  };
  const settings = {
    boolean: jest.fn((k: string) =>
      Promise.resolve(
        k === 'case_alerts.default_enabled' ? (opts.defaultOn ?? true) : false,
      ),
    ),
    number: jest.fn(() => Promise.resolve(3)),
  } as unknown as AppSettingsService;
  return {
    svc: new CaseAudienceService(prisma as unknown as PrismaService, settings),
    prisma,
    sql,
  };
}

jest.mock('../../../sharding/split-reads', () => ({
  readsAreSplit: (p: { splitReads?: boolean }) => !!p.splitReads,
}));

describe('CaseAudienceService — who hears about a new case', () => {
  it('one database: a missing toggle row counts as ON (LEFT JOIN + COALESCE)', async () => {
    const { svc, sql, prisma } = make({ defaultOn: true });
    await svc.forCase(CASE);
    expect(sql[0]).toContain('LEFT JOIN notification_settings');
    expect(sql[0]).toContain('COALESCE(s.push_enabled');
    // Bound values: case id, urgent, the default, the LIMIT.
    expect(prisma.$queryRaw.mock.calls[0][3]).toBe(true);
  });

  it('one database: the admin switch off passes false as the default', async () => {
    const { svc, prisma } = make({ defaultOn: false });
    await svc.forCase(CASE);
    expect(prisma.$queryRaw.mock.calls[0][3]).toBe(false);
  });

  it('several databases: no row = on, explicit off = out, switch off = old opt-in', async () => {
    const rows = [
      { user_id: 'a1', push_enabled: true },
      { user_id: 'a2', push_enabled: false },
    ];
    const on = make({ split: true, defaultOn: true, settingsRows: rows });
    expect(
      (await on.svc.forCase(CASE)).candidates.map((c) => c.id).sort(),
    ).toEqual(['a1', 'a3']);
    const off = make({ split: true, defaultOn: false, settingsRows: rows });
    expect((await off.svc.forCase(CASE)).candidates.map((c) => c.id)).toEqual([
      'a1',
    ]);
  });

  it('a dated case is urgent by the client day, not the UTC day (H-3)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-06T00:30:00Z'));
    try {
      const deadline = new Date('2026-10-05T00:00:00Z');
      const la = make({ clientTz: 'America/Los_Angeles', deadline });
      expect((await la.svc.forCase(CASE)).urgent).toBe(true); // 17:30 Oct 5
      const utc = make({ clientTz: null, deadline });
      expect((await utc.svc.forCase(CASE)).urgent).toBe(false); // overdue
    } finally {
      jest.useRealTimers();
    }
  });

  it('M-5: over the bound the most trusted / reviewed are kept (ORDER BY before LIMIT), in both modes', async () => {
    const one = make({});
    await one.svc.forCase(CASE);
    expect(one.sql[0]).toMatch(
      /ORDER BY max\(p\.trust_level\) DESC, max\(p\.rating_count\) DESC[\s\S]*LIMIT/,
    );
    const split = make({ split: true });
    await split.svc.forCase(CASE);
    expect(split.prisma.attorneyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { trust_level: 'desc' },
          { rating_count: 'desc' },
          { user_id: 'asc' },
        ],
      }),
    );
  });

  it('C-1: every candidate says whether «Только срочные» is on', async () => {
    const one = make({});
    await one.svc.forCase(CASE);
    expect(one.sql[0]).toContain('bool_or(p.new_case_alerts_urgent_only)');
    const split = make({ split: true });
    const c = (await split.svc.forCase(CASE)).candidates;
    expect(c.find((x) => x.id === 'a2')?.urgentOnly).toBe(true);
    expect(c.find((x) => x.id === 'a1')?.urgentOnly).toBe(false);
  });
});
