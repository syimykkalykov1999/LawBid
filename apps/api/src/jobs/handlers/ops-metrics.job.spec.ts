import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { STRIPE_WEBHOOKS_DLQ } from '../../modules/billing/billing.constants';
import { OpsMetricsJob } from './ops-metrics.job';

const fakeQueue = (name: string, waiting: number) => ({
  name,
  getJobCounts: jest.fn(() =>
    Promise.resolve({ waiting, active: 0, delayed: 0, failed: 0 }),
  ),
  getWaiting: jest.fn(() => Promise.resolve([])),
  close: jest.fn(() => Promise.resolve()),
});

describe('OpsMetricsJob.queueDepths', () => {
  it('logs one queue_waiting_total line without the DLQ (worker autoscaling metric)', async () => {
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new OpsMetricsJob(
      {} as ConfigService,
      {} as PrismaService,
      logger as unknown as PinoLogger,
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
    });
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
