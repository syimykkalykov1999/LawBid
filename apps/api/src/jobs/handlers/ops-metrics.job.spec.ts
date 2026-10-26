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
