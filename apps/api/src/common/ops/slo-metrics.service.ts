import {
  Global,
  Injectable,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

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

  constructor(private readonly logger: PinoLogger) {
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
