import type { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  accessReportKey,
  AdminAccessReportService,
  monthRange,
  previousMonth,
} from './admin-access-report.service';
import { TOTALS_BUTTON_COOLDOWN_MS } from './dashboard.service';

describe('monthRange / previousMonth', () => {
  it('parses a UTC month', () => {
    const r = monthRange('2026-02');
    expect(r?.from.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(r?.to.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(monthRange('2026-13')).toBeNull();
    expect(monthRange('26-1')).toBeNull();
  });
  it('previous month wraps the year', () => {
    expect(previousMonth(new Date('2027-01-01T07:15:00Z'))).toBe('2026-12');
    expect(previousMonth(new Date('2026-11-01T07:15:00Z'))).toBe('2026-10');
  });
});

describe('AdminAccessReportService', () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const STORED = [
    {
      adminId: 'a1',
      action: 'admin.private_read.chat_messages',
      reasonCode: 'report_review',
      count: 5,
    },
  ];

  function make(
    enabled = true,
    stored?: { data: unknown; computedAt: string } | null,
  ) {
    const groupBy = jest
      .fn()
      // all
      .mockResolvedValueOnce([
        {
          admin_id: 'a1',
          action: 'admin.private_read.chat_messages',
          reason_code: 'report_review',
          _count: { _all: 5 },
        },
        {
          admin_id: 'a2',
          action: 'admin.private_read.message_body',
          reason_code: 'legal_process',
          _count: { _all: 2 },
        },
      ])
      // failed attempts
      .mockResolvedValueOnce([
        {
          admin_id: 'a2',
          action: 'admin.private_read.message_body',
          reason_code: 'legal_process',
          _count: { _all: 2 },
        },
      ]);
    const prisma = {
      // The groups are counted inside the snapshot transaction.
      $transaction: (fn: (tx: unknown) => unknown) =>
        fn({ $executeRaw: jest.fn(), auditLog: { groupBy } }),
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'a1', email: 'mod@example.com' }])
          .mockResolvedValue([{ email: 'owner@example.com' }]),
      },
    };
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const summary =
      stored === undefined
        ? undefined
        : {
            peek: jest.fn().mockResolvedValue(stored),
            refresh: jest.fn(async (_k: string, c: () => Promise<unknown>) => ({
              data: await c(),
              computedAt: new Date().toISOString(),
            })),
          };
    const svc = new AdminAccessReportService(
      prisma as unknown as PrismaService,
      {
        boolean: jest.fn().mockResolvedValue(enabled),
      } as unknown as AppSettingsService,
      { sendEmail },
      summary as unknown as AdminSummaryService,
    );
    return { svc, sendEmail, prisma, groupBy, summary };
  }

  it('counts reads by admin, kind and reason, without refused attempts', async () => {
    const { svc } = make();
    const r = await svc.build('2026-10');
    expect(r?.total).toBe(5);
    expect(r?.rows).toEqual([
      {
        adminId: 'a1',
        adminEmail: 'mod@example.com',
        kind: 'chat_messages',
        reasonCode: 'report_review',
        count: 5,
      },
    ]);
  });

  it('a bad month yields no report', async () => {
    expect(await make().svc.build('nope')).toBeNull();
  });

  it('reads a stored month without counting (closed month: kept as is)', async () => {
    const { svc, groupBy, summary } = make(true, {
      data: STORED,
      computedAt: '2026-11-03T04:10:00.000Z',
    });
    const r = await svc.build('2026-10');
    expect(r?.total).toBe(5);
    expect(r?.rows[0]).toMatchObject({ kind: 'chat_messages', count: 5 });
    expect(groupBy).not.toHaveBeenCalled();
    expect(summary?.refresh).not.toHaveBeenCalled();
  });

  it('recounts the running month once a day, and keeps it the rest of the day', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const stale = make(true, { data: STORED, computedAt: ago(27 * 3_600_000) });
    await stale.svc.build(month);
    expect(stale.summary?.refresh).toHaveBeenCalledWith(
      accessReportKey(month),
      expect.any(Function),
      true,
    );
    expect(stale.groupBy).toHaveBeenCalledTimes(2);
    const fresh = make(true, { data: STORED, computedAt: ago(3_600_000) });
    await fresh.svc.build(month);
    expect(fresh.groupBy).not.toHaveBeenCalled();
  });

  it('counts when nothing is stored, and the e-mail job counts fresh', async () => {
    const cold = make(true, null);
    await cold.svc.build('2026-10');
    expect(cold.groupBy).toHaveBeenCalledTimes(2);
    const job = make(true, {
      data: [],
      computedAt: '2026-10-31T23:50:00.000Z',
    });
    const r = await job.svc.sendMonthly(new Date('2026-11-01T07:15:00Z'));
    expect(r).toMatchObject({ month: '2026-10', total: 5 });
    expect(job.summary?.refresh).toHaveBeenCalledWith(
      accessReportKey('2026-10'),
      expect.any(Function),
      false,
    );
  });

  it('the button recounts this month at most once per 10 minutes', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const inside = make(true, {
      data: STORED,
      computedAt: ago(TOTALS_BUTTON_COOLDOWN_MS - 60_000),
    });
    await inside.svc.refresh();
    expect(inside.summary?.refresh).not.toHaveBeenCalled();
    const after = make(true, {
      data: STORED,
      computedAt: ago(TOTALS_BUTTON_COOLDOWN_MS + 60_000),
    });
    await after.svc.refresh();
    expect(after.summary?.refresh).toHaveBeenCalledWith(
      accessReportKey(month),
      expect.any(Function),
    );
  });

  it('e-mails last month’s report to the owners', async () => {
    const { svc, sendEmail } = make();
    const r = await svc.sendMonthly(new Date('2026-11-01T07:15:00Z'));
    expect(r).toMatchObject({ month: '2026-10', total: 5, sent: 1 });
    expect(sendEmail.mock.calls[0][0].to).toBe('owner@example.com');
    expect(sendEmail.mock.calls[0][0].text).toContain(
      'mod@example.com: 5 x chat_messages',
    );
  });

  it('is silent when switched off', async () => {
    const { svc, sendEmail } = make(false);
    expect(await svc.sendMonthly()).toEqual({ skipped: 'switched off' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
