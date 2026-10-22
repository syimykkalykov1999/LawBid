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
