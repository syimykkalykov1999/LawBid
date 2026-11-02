import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../../../prisma/prisma.service';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from './with-timeout.util';

/** Stability sweep 2026-11-02: an RDS Multi-AZ failover (instance class
 * change, maintenance) takes the database away for 30–40 s. Readiness
 * failing for that long makes the ALB / ECS replace every healthy task
 * (2026-10-28 and 2026-10-31: ~100 failed probes); the tasks cannot fix a
 * database, and restarting them only adds a cold-start storm when it
 * returns. A process that saw the database answer within this grace keeps
 * reporting ready; a longer outage still turns it 503. */
export const DATABASE_READY_GRACE_MS = 60_000;

/** `SELECT 1` round trip through the app's own Prisma pool — proves the
 * pool can hand out a connection and PostgreSQL answers, which is what
 * readiness means for this process. Error detail is kept generic: the
 * probe response is unauthenticated, so no DSN/host leaks into it. */
@Injectable()
export class DatabaseHealthIndicator {
  /** When the database last answered this process (0: never). */
  private lastOkAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const session = this.indicators.check(key);
    try {
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        HEALTH_CHECK_TIMEOUT_MS,
        'database',
      );
      this.lastOkAt = Date.now();
      return session.up();
    } catch {
      if (
        this.lastOkAt > 0 &&
        Date.now() - this.lastOkAt < DATABASE_READY_GRACE_MS
      ) {
        return session.up({ grace: true });
      }
      return session.down({ message: 'database unreachable' });
    }
  }
}
