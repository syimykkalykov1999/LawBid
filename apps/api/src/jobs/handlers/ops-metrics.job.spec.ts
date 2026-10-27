import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { STRIPE_WEBHOOKS_DLQ } from '../../modules/billing/billing.constants';
import { OpsMetricsJob } from './ops-metrics.job';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';

const fakeQueue = (name: string, waiting: number, failed5m = 0) => ({
  name,
  getJobCounts: jest.fn(() =>
    Promise.resolve({ waiting, active: 0, delayed: 0, failed: 0 }),
  ),
  getWaiting: jest.fn(() => Promise.resolve([])),
  getMetrics: jest.fn(() =>
    Promise.resolve({ meta: {}, data: [failed5m, 0, 0, 0, 0], count: 5 }),
  ),
  close: jest.fn(() => Promise.resolve()),
});

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
