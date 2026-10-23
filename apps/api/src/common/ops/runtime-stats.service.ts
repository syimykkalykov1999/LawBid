import {
  Global,
  Injectable,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { getHeapStatistics } from 'node:v8';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

const EMIT_MS = 60_000;

/**
 * Load audit 6 (2026-10-23): the number that says "this Node process is
 * saturated" before users feel it - event-loop delay - plus heap and memory.
 * CPU percentage cannot show it (a process blocked on one big JSON.stringify
 * can sit at 40 % CPU and still answer every request 300 ms late).
 *
 * Written as ONE CloudWatch Embedded Metric Format line a minute per process:
 * CloudWatch turns it into custom metrics `LawBid/Runtime` (dimension
 * `Service` = api | worker) with no agent and no Terraform. Cost: 6 metrics x
 * 2 services = 12 custom metrics, about $3.60 a month, at any scale.
 * `RUNTIME_STATS=off` switches it off.
 */
export interface RuntimeSample {
  // PascalCase on purpose: EMF reads the metric value from the key that has
  // the metric's name.
  EventLoopP50Ms: number;
  EventLoopP99Ms: number;
  EventLoopMaxMs: number;
  HeapUsedMb: number;
  HeapLimitMb: number;
  RssMb: number;
}

export function emfLine(
  service: string,
  s: RuntimeSample,
  now = Date.now(),
): string {
  const unit = (name: string, u: string) => ({ Name: name, Unit: u });
  return JSON.stringify({
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [
        {
          Namespace: 'LawBid/Runtime',
          Dimensions: [['Service']],
          Metrics: [
            unit('EventLoopP50Ms', 'Milliseconds'),
            unit('EventLoopP99Ms', 'Milliseconds'),
            unit('EventLoopMaxMs', 'Milliseconds'),
            unit('HeapUsedMb', 'Megabytes'),
            unit('HeapLimitMb', 'Megabytes'),
            unit('RssMb', 'Megabytes'),
          ],
        },
      ],
    },
    Service: service,
    ...s,
  });
}

@Injectable()
export class RuntimeStatsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private histogram?: IntervalHistogram;
  private timer?: NodeJS.Timeout;

  onApplicationBootstrap(): void {
    if (
      process.env.RUNTIME_STATS === 'off' ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
    this.histogram.enable();
    this.timer = setInterval(() => this.emit(), EMIT_MS);
    this.timer.unref();
  }

  sample(): RuntimeSample | null {
    const h = this.histogram;
    if (!h) return null;
    const ms = (ns: number) => Math.round((ns / 1e6) * 10) / 10;
    const mem = process.memoryUsage();
    const heapLimit = getHeapStatistics().heap_size_limit;
    const s: RuntimeSample = {
      EventLoopP50Ms: ms(h.percentile(50)),
      EventLoopP99Ms: ms(h.percentile(99)),
      EventLoopMaxMs: ms(h.max),
      HeapUsedMb: Math.round(mem.heapUsed / 1048576),
      HeapLimitMb: Math.round(heapLimit / 1048576),
      RssMb: Math.round(mem.rss / 1048576),
    };
    h.reset();
    return s;
  }

  emit(): void {
    const s = this.sample();
    if (!s) return;
    const service = process.argv[1]?.includes('worker') ? 'worker' : 'api';
    process.stdout.write(emfLine(service, s) + '\n');
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.histogram?.disable();
  }
}

@Global()
@Module({ providers: [RuntimeStatsService], exports: [RuntimeStatsService] })
export class RuntimeStatsModule {}
