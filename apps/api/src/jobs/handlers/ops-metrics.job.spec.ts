import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { STRIPE_WEBHOOKS_DLQ } from '../../modules/billing/billing.constants';
import { OpsMetricsJob } from './ops-metrics.job';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';

/** A queue whose failed set holds jobs finished at [failedAt] (ms), newest
 * first like BullMQ's `getFailed`. */
const queueWithFailed = (name: string, waiting: number, failedAt: number[]) => {
  const failed = [...failedAt]
    .sort((a, b) => b - a)
    .map((finishedOn) => ({ finishedOn }));
  return {
    name,
    getJobCounts: jest.fn(() =>
      Promise.resolve({
        waiting,
        active: 0,
        delayed: 0,
        failed: failed.length,
      }),
    ),
    getWaiting: jest.fn(() => Promise.resolve([])),
    getFailed: jest.fn((start: number, end: number) =>
      Promise.resolve(failed.slice(start, end + 1)),
    ),
    // Prod 2026-11-13: BullMQ's failed metrics keep the last points until
    // the next failure; the job must not read them.
    getMetrics: jest.fn(() =>
      Promise.resolve({ meta: {}, data: [33, 0, 0, 0, 0], count: 5 }),
    ),
    close: jest.fn(() => Promise.resolve()),
  };
};

const fakeQueue = (name: string, waiting: number, failed5m = 0) =>
  queueWithFailed(
    name,
    waiting,
    Array.from({ length: failed5m }, () => Date.now() - 1_000),
  );

const settings = (mode: string) =>
  ({
    string: jest.fn(() => Promise.resolve(mode)),
  }) as unknown as AppSettingsService;

describe('OpsMetricsJob.queueDepths', () => {
  it('logs one queue_waiting_total line without the DLQ (worker autoscaling metric)', async () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new OpsMetricsJob(
      {} as ConfigService,
      {} as PrismaService,
      logger as unknown as PinoLogger,
      settings('off'),
    );
    (job as unknown as { queues: unknown[] }).queues = [
      fakeQueue('push', 7),
      fakeQueue('files', 3),
      fakeQueue(STRIPE_WEBHOOKS_DLQ, 100),
    ];

    const rows = await job.queueDepths();

    expect(rows).toHaveLength(3);
    const totals = logger.info.mock.calls.filter(
      ([o]) => (o as { metric?: string }).metric === 'queue_waiting_total',
    );
    expect(totals).toHaveLength(1);
    expect(totals[0][0]).toEqual({
      metric: 'queue_waiting_total',
      waiting: 10,
      rawWaiting: 10,
      mode: 'off',
    });
  });

  it('publishes the cost-weighted signal by default (S10-10)', async () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new OpsMetricsJob(
      {} as ConfigService,
      {} as PrismaService,
      logger as unknown as PinoLogger,
      settings('auto'),
    );
    (job as unknown as { queues: unknown[] }).queues = [
      fakeQueue('push', 10),
      fakeQueue('data-export', 4),
    ];
    await job.queueDepths();
    const total = logger.info.mock.calls
      .map(([o]) => o as { metric?: string; waiting?: number })
      .find((o) => o.metric === 'queue_waiting_total');
    // 10 x 0.5 + 4 x 25 = 105 (the flat sum would be 14)
    expect(total?.waiting).toBe(105);
  });

  it('counts prioritized jobs as waiting — every push job has a priority (row 79, 1B load test)', async () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new OpsMetricsJob(
      {} as ConfigService,
      {} as PrismaService,
      logger as unknown as PinoLogger,
      settings('off'),
    );
    const now = new Date('2026-11-13T08:40:00Z');
    const push = {
      ...fakeQueue('push', 0),
      // The stand: wait list empty, 386 409 push jobs in `prioritized`.
      getJobCounts: jest.fn(() =>
        Promise.resolve({
          waiting: 0,
          prioritized: 386_409,
          active: 20,
          delayed: 0,
          failed: 0,
        }),
      ),
      getPrioritized: jest.fn(() =>
        Promise.resolve([{ timestamp: now.getTime() - 601_000, delay: 1000 }]),
      ),
    };
    (job as unknown as { queues: unknown[] }).queues = [push];
    const [row] = await job.queueDepths(now);
    expect(push.getJobCounts).toHaveBeenCalledWith(
      'waiting',
      'prioritized',
      'active',
      'delayed',
      'failed',
    );
    expect(row.waiting).toBe(386_409);
    expect(row.oldestAgeSeconds).toBe(600);
    const total = logger.info.mock.calls
      .map(([o]) => o as { metric?: string; waiting?: number })
      .find((o) => o.metric === 'queue_waiting_total');
    expect(total?.waiting).toBe(386_409);
  });

  it('reports exhausted failures of the last 5 minutes per queue (S10-7)', async () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new OpsMetricsJob(
      {} as ConfigService,
      {} as PrismaService,
      logger as unknown as PinoLogger,
    );
    (job as unknown as { queues: unknown[] }).queues = [
      fakeQueue('data-export', 0, 2),
      fakeQueue('push', 0, 0),
    ];
    const rows = await job.queueDepths();
    expect(rows.map((r) => [r.queue, r.failed5m])).toEqual([
      ['data-export', 2],
      ['push', 0],
    ]);
  });

  it('counts only failures finished in the last 5 minutes, never stale metric points (KNOWN_ERRORS 125)', async () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new OpsMetricsJob(
      {} as ConfigService,
      {} as PrismaService,
      logger as unknown as PinoLogger,
    );
    const now = new Date('2026-11-13T06:00:00Z');
    const t = now.getTime();
    // The 11.11 outage left 200 old failures and a stale metrics list (33).
    const outage = Array.from({ length: 200 }, (_, i) => t - 40 * 3600_000 - i);
    const quiet = queueWithFailed('cron-fast', 0, outage);
    const fresh = queueWithFailed('cron', 0, [
      t - 10_000,
      t - 4 * 60_000,
      t - 6 * 60_000,
      ...outage,
    ]);
    (job as unknown as { queues: unknown[] }).queues = [quiet, fresh];
    const rows = await job.queueDepths(now);
    expect(rows.map((r) => [r.queue, r.failed5m])).toEqual([
      ['cron-fast', 0],
      ['cron', 2],
    ]);
    // A quiet queue costs one page read, and the metrics list is not used.
    expect(quiet.getFailed).toHaveBeenCalledTimes(1);
    expect(quiet.getMetrics).not.toHaveBeenCalled();
  });

  it('pages through a burst and caps at the failed-set size', async () => {
    const job = new OpsMetricsJob(
      {} as ConfigService,
      {} as PrismaService,
      { setContext: jest.fn(), info: jest.fn() } as unknown as PinoLogger,
    );
    const t = Date.parse('2026-11-13T06:00:00Z');
    const burst = queueWithFailed(
      'push',
      0,
      Array.from({ length: 45 }, (_, i) => t - i * 1000),
    );
    const flood = queueWithFailed(
      'files',
      0,
      Array.from({ length: 500 }, () => t - 1000),
    );
    expect(await job.failedLast5m(burst as unknown as Queue, t)).toBe(45);
    expect(burst.getFailed).toHaveBeenCalledTimes(3);
    expect(await job.failedLast5m(flood as unknown as Queue, t)).toBe(200);
  });
});

describe('OpsMetricsJob.businessCounters (dedup D-3)', () => {
  const NOW = new Date('2026-10-25T12:00:00Z');
  const make = (summary: unknown) => {
    const count = () => jest.fn().mockResolvedValue(7);
    const prisma = {
      user: { count: count() },
      case: { count: count() },
      bid: { count: count() },
      subscription: { count: count() },
    };
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new OpsMetricsJob(
      {} as ConfigService,
      prisma as unknown as PrismaService,
      logger as unknown as PinoLogger,
      undefined,
      summary as never,
    );
    return { job, prisma, logger };
  };
  const dashboard = (ageSeconds: number) => ({
    peek: jest.fn().mockResolvedValue({
      computedAt: new Date(NOW.getTime() - ageSeconds * 1000).toISOString(),
      data: {
        openCases: 11,
        subscriptions: { trialing: 2, active: 5, pastDue: 1 },
      },
    }),
  });

  it('takes open cases and the three subscription counts from the dashboard summary, not from the database again', async () => {
    const { job, prisma, logger } = make(dashboard(120));
    const c = await job.businessCounters(NOW);
    expect(c).toMatchObject({
      casesOpen: 11,
      subscriptionsTrialing: 2,
      subscriptionsActive: 5,
      subscriptionsPastDue: 1,
      registrations24h: 7,
      bidsActive: 7,
    });
    expect(prisma.case.count).not.toHaveBeenCalled();
    expect(prisma.subscription.count).not.toHaveBeenCalled();
    // The two numbers the dashboard does not hold are still counted here.
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
    expect(prisma.bid.count).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'business', casesOpen: 11 }),
      'business counters',
    );
  });

  it('counts by itself when there is no summary or it is stale (stuck refresher)', async () => {
    for (const summary of [
      undefined,
      { peek: jest.fn().mockResolvedValue(null) },
      dashboard(3600),
    ]) {
      const { job, prisma } = make(summary);
      const c = await job.businessCounters(NOW);
      expect(c.casesOpen).toBe(7);
      expect(c.subscriptionsActive).toBe(7);
      expect(prisma.case.count).toHaveBeenCalledTimes(1);
      expect(prisma.subscription.count).toHaveBeenCalledTimes(3);
    }
  });
});
