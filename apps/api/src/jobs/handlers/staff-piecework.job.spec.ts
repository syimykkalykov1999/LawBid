import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  A1,
  done,
  emptyFx,
  makeService,
  rate,
  withPerson,
} from '../../../test/support/staff-piecework-fixtures';
import { PayrollAccrualsService } from '../../modules/admin-payroll/payroll-accruals.service';
import { StaffPieceworkService } from '../../modules/staff-piecework/staff-piecework.service';
import { CRON_JOBS, CRON_SCHEDULES } from '../jobs.constants';
import { StaffPieceworkJob } from './staff-piecework.job';

const settings = (stored: Record<string, unknown>) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

/** A database that fails the test if anything touches it. */
const noDb = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      throw new Error(`DB touched: ${String(prop)}`);
    },
  },
) as unknown as PrismaService;

describe('staff.piecework job', () => {
  it('switch off (the default): returns at once, no query, no call out', async () => {
    const off = settings({});
    const svc = new StaffPieceworkService(
      noDb,
      off,
      new PayrollAccrualsService(noDb),
      noDb as never,
    );
    await expect(new StaffPieceworkJob(off, svc).run()).resolves.toEqual({
      skipped: 'off',
    });
  });

  it('on: counts YESTERDAY of the report time zone and produces the accrual through payroll', async () => {
    const fx = emptyFx();
    // Row 180 B9 (#1092): a new report zone counts from the NEXT day (a
    // recorded schedule; days already worked are never re-cut). These cases
    // run after the switch: Nevada is on the schedule from 1 Oct 2026.
    fx.config = {
      'staff.piecework_day_zones': [
        { from: '2026-10-01', tz: 'America/Los_Angeles' },
      ],
    };
    withPerson(fx, A1);
    fx.rates.push(rate('ticket', 250));
    // Three in the Nevada morning, one at 18:00 PDT (01:00Z the next UTC day).
    fx.leaseDone.push(
      ...done(A1, 'support_ticket', 3, new Date('2026-10-26T16:00:00Z')),
      ...done(A1, 'support_ticket', 1, new Date('2026-10-27T01:00:00Z')),
    );
    fx.snapshots.push({ admin_id: A1, rating: 91, status: 'green' });
    const { svc, settings: on } = makeService(fx);
    const job = new StaffPieceworkJob(on, svc);

    // The cron time (10:15 UTC = 03:15 PDT): 26 Oct in Nevada is complete.
    const out = await job.run(new Date('2026-10-27T10:15:00Z'));
    expect(out).toMatchObject({
      day: '2026-10-26',
      admins: 1,
      accrued: 1,
      totalCents: 1100,
    });
    expect(fx.accruals).toEqual([
      expect.objectContaining({
        event_ref: `staff_piecework:${A1}:2026-10-26`,
        amount_cents: 1100,
        status: 'pending',
      }),
    ]);

    // The cron fires twice (retry / restart): still one accrual.
    await job.run(new Date('2026-10-27T10:15:30Z'));
    expect(fx.accruals).toHaveLength(1);
  });

  it('runs after daily-stats and the rating snapshot of the same local day', () => {
    const at = (name: string) =>
      CRON_SCHEDULES.find((c) => c.name === name)!.pattern;
    expect(at(CRON_JOBS.staffDailyStats)).toBe('10 9 * * *');
    expect(at(CRON_JOBS.staffRatingNightly)).toBe('40 9 * * *');
    expect(at(CRON_JOBS.staffPiecework)).toBe('15 10 * * *');
  });
});
