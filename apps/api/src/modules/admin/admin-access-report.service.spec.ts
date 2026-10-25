import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  AdminAccessReportService,
  monthRange,
  previousMonth,
} from './admin-access-report.service';

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
  function make(enabled = true) {
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
      auditLog: { groupBy },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'a1', email: 'mod@example.com' }])
          .mockResolvedValue([{ email: 'owner@example.com' }]),
      },
    };
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const svc = new AdminAccessReportService(
      prisma as unknown as PrismaService,
      {
        boolean: jest.fn().mockResolvedValue(enabled),
      } as unknown as AppSettingsService,
      { sendEmail },
    );
    return { svc, sendEmail, prisma };
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
