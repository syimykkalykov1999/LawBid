import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from './with-timeout.util';

/** PING on the shared client. Redis is on the hot path of every request
 * (throttler, JWT blacklist, OTP, cost guard fails closed without it), so
 * an instance that can't reach it must drop out of the load balancer. */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    const session = this.indicators.check(key);
    try {
      const reply = await withTimeout(
        this.redis.ping(),
        HEALTH_CHECK_TIMEOUT_MS,
        'redis',
      );
      if (reply !== 'PONG') {
        return session.down({ message: 'unexpected PING reply' });
      }
      return session.up();
    } catch {
      return session.down({ message: 'redis unreachable' });
    }
  }
}
