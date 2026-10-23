import {
  Global,
  Inject,
  Injectable,
  Module,
  Optional,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** Owner 2026-10-22: the minute's counts are also kept in Redis (26 h) so the
 * status board can read the push success rate without a log service. */
export const SLO_REDIS_PREFIX = 'ops:slo:';

/**
 * Owner 2026-10-22 (audit #4 §7, Google SRE "Alerting on SLOs"): the
 * business events the SLO alarms watch. Counted in memory and written as
 * ONE log line a minute per process — `{metric: "slo", signup, otpSent,
 * otpVerified, callConnected, callFailed, pushOk, pushFailed}` — which the
 * CloudWatch metric filters of infra/modules/monitoring turn into metrics
 * (a log line per push would cost more than the push).
 */
export const SLO_COUNTERS = [
  'signup',
  'otpSent',
  'otpVerified',
  'callConnected',
  'callFailed',
  'pushOk',
  'pushFailed',
] as const;
export type SloCounter = (typeof SLO_COUNTERS)[number];

const FLUSH_MS = 60_000;

@Injectable()
export class SloMetricsService implements OnModuleInit, OnApplicationShutdown {
  private counts = new Map<SloCounter, number>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly logger: PinoLogger,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {
    this.logger.setContext(SloMetricsService.name);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  count(name: SloCounter, n = 1): void {
    if (n <= 0) return;
    this.counts.set(name, (this.counts.get(name) ?? 0) + n);
  }

  /** Writes the line and starts over; nothing to say = no line. */
  flush(): Record<SloCounter, number> | null {
    if (this.counts.size === 0) return null;
    const line = Object.fromEntries(
      SLO_COUNTERS.map((k) => [k, this.counts.get(k) ?? 0]),
    ) as Record<SloCounter, number>;
    this.counts = new Map();
    this.logger.info({ metric: 'slo', ...line }, 'slo counters');
    if (this.redis) {
      const key = SLO_REDIS_PREFIX + Math.floor(Date.now() / 60_000);
      const pipe = this.redis.pipeline();
      for (const [k, n] of Object.entries(line)) {
        if (n > 0) pipe.hincrby(key, k, n);
      }
      pipe.expire(key, 26 * 3600);
      void pipe.exec().catch(() => undefined);
    }
    return line;
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}

/** Global: auth, calls and pushes (API and worker) count into it. */
@Global()
@Module({
  providers: [SloMetricsService],
  exports: [SloMetricsService],
})
export class SloMetricsModule {}
