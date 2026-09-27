import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../../../prisma/prisma.service';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from './with-timeout.util';

/** `SELECT 1` round trip through the app's own Prisma pool — proves the
 * pool can hand out a connection and CockroachDB answers, which is what
 * readiness means for this process. Error detail is kept generic: the
 * probe response is unauthenticated, so no DSN/host leaks into it. */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const session = this.indicators.check(key);
    try {
      await withTimeout(
        this.prisma.$queryRawUnsafe('SELECT 1'),
        HEALTH_CHECK_TIMEOUT_MS,
        'database',
      );
      return session.up();
    } catch {
      return session.down({ message: 'database unreachable' });
    }
  }
}
