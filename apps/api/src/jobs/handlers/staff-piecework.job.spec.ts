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

  it('on: counts YESTERDAY (UTC) and produces the accrual through payroll', async () => {
    const fx = emptyFx();
    withPerson(fx, A1);
    fx.rates.push(rate('ticket', 250));
    fx.leaseDone.push(...done(A1, 'support_ticket', 4));
    fx.snapshots.push({ admin_id: A1, rating: 91, status: 'green' });
    const { svc, settings: on } = makeService(fx);
    const job = new StaffPieceworkJob(on, svc);

    const out = await job.run(new Date('2026-10-27T02:15:00Z'));
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
    await job.run(new Date('2026-10-27T02:15:30Z'));
    expect(fx.accruals).toHaveLength(1);
  });
});
