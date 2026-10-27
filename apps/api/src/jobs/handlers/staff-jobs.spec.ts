import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import type { StaffSwitchKey } from '../../modules/staff-core/staff-settings.defaults';
import { StaffAiQaNightlyJob } from './staff-ai-qa-nightly.job';
import { StaffAnomaliesJob } from './staff-anomalies.job';
import { StaffCountersFlushJob } from './staff-counters-flush.job';
import { StaffLeaseSweepJob } from './staff-lease-sweep.job';
import {
  STAFF_RETENTION_BATCH,
  StaffRetentionJob,
} from './staff-retention.job';
import { StaffTodayJob } from './staff-today.job';
import { StaffWeeklyDigestJob } from './staff-weekly-digest.job';

/** Real StaffSettingsService over a stored-config object. */
const settings = (stored: Record<string, unknown> = {}) =>
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

type Runner = { run: () => Promise<unknown> };
const stubs: Array<
  [string, (s: StaffSettingsService) => Runner, StaffSwitchKey[]]
> = [
  [
    'staff.lease-sweep',
    (s) => new StaffLeaseSweepJob(s),
    ['staff.lease_enabled'],
  ],
  [
    'staff.counters-flush',
    (s) => new StaffCountersFlushJob(s),
    ['staff.rating_enabled'],
  ],
  ['staff.today', (s) => new StaffTodayJob(s), ['staff.owner_home_enabled']],
  [
    'staff.anomalies',
    (s) => new StaffAnomaliesJob(s),
    ['staff.anomalies_enabled'],
  ],
  [
    'staff.ai-qa-nightly',
    (s) => new StaffAiQaNightlyJob(s),
    ['staff.ai_enabled', 'staff.ai_qa_enabled'],
  ],
  [
    'staff.weekly-digest',
    (s) => new StaffWeeklyDigestJob(s),
    ['staff.weekly_digest_enabled'],
  ],
];

describe('staff.* cron jobs (staff package T1 stubs; daily-stats and rating-nightly are T5, head-score and retaliation-expire are T6)', () => {
  describe.each(stubs)('%s', (_name, make, keys) => {
    it('switch off (the default): returns at once, no work', async () => {
      await expect(make(settings()).run()).resolves.toEqual({ skipped: 'off' });
    });

    it('switch on: still a stub that does nothing until its task fills it', async () => {
      const on = Object.fromEntries(keys.map((k) => [k, true]));
      await expect(make(settings(on)).run()).resolves.toEqual({
        skipped: 'not built yet',
      });
    });
  });

  it('staff.ai-qa-nightly: the sub-switch alone (master off) makes no AI call', async () => {
    const job = new StaffAiQaNightlyJob(
      settings({ 'staff.ai_qa_enabled': true }),
    );
    await expect(job.run()).resolves.toEqual({ skipped: 'off' });
  });
});

describe('staff.retention', () => {
  it('both journals switched off (the default): no query at all', async () => {
    const job = new StaffRetentionJob(settings(), noDb);
    await expect(job.run()).resolves.toEqual({ skipped: 'off' });
  });

  it('on: deletes in batches of 500 by created_at until a short batch, per journal', async () => {
    const counts = [STAFF_RETENTION_BATCH, 3, 0];
    const $executeRaw = jest.fn(() => Promise.resolve(counts.shift() ?? 0));
    const job = new StaffRetentionJob(
      settings({ 'staff.lease_enabled': true }),
      { $executeRaw } as unknown as PrismaService,
    );
    await expect(job.run(new Date('2026-10-27T03:00:00Z'))).resolves.toEqual({
      signals: STAFF_RETENTION_BATCH + 3,
      leaseEvents: 0,
    });
    expect($executeRaw).toHaveBeenCalledTimes(3);
    const sql = (
      $executeRaw.mock.calls as unknown as [
        TemplateStringsArray,
        ...unknown[],
      ][]
    ).map((c) => c[0].join('?'));
    expect(sql[0]).toContain('DELETE FROM "staff_quality_signals"');
    expect(sql[2]).toContain('DELETE FROM "work_lease_events"');
    // 120 days for the signals, 90 for the lease events.
    const firstCut = ($executeRaw.mock.calls[0] as unknown[])[1] as Date;
    expect(firstCut.toISOString()).toBe('2026-06-29T03:00:00.000Z');
    const leaseCut = ($executeRaw.mock.calls[2] as unknown[])[1] as Date;
    expect(leaseCut.toISOString()).toBe('2026-07-29T03:00:00.000Z');
  });
});
