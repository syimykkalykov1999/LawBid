import type { HealthIndicatorService } from '@nestjs/terminus';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  DATABASE_READY_GRACE_MS,
  DatabaseHealthIndicator,
} from './database.health';

function make(queryRaw: jest.Mock) {
  const indicators = {
    check: () => ({
      up: (d?: object) => ({ database: { status: 'up', ...d } }),
      down: (d?: object) => ({ database: { status: 'down', ...d } }),
    }),
  } as unknown as HealthIndicatorService;
  return new DatabaseHealthIndicator(
    { $queryRaw: queryRaw } as unknown as PrismaService,
    indicators,
  );
}

describe('DatabaseHealthIndicator', () => {
  afterEach(() => jest.useRealTimers());

  it('is down when the database never answered', async () => {
    const h = make(jest.fn().mockRejectedValue(new Error('refused')));
    expect((await h.isHealthy()).database.status).toBe('down');
  });

  it('stays up through a short failover, then goes down', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-02T00:00:00Z') });
    const q = jest.fn().mockResolvedValueOnce([{}]);
    const h = make(q);
    expect((await h.isHealthy()).database.status).toBe('up');
    q.mockRejectedValue(new Error('failover'));
    jest.setSystemTime(Date.now() + 40_000);
    expect((await h.isHealthy()).database.status).toBe('up');
    jest.setSystemTime(Date.now() + DATABASE_READY_GRACE_MS);
    expect((await h.isHealthy()).database.status).toBe('down');
  });
});
