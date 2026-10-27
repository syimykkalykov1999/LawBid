import {
  Inject,
  Injectable,
  Optional,
  type NestMiddleware,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { pipeline } from '../../redis/redis-cluster-safe';
import { RouteMetricsService } from './route-metrics.service';

import { LATENCY_EDGES_MS } from './latency-edges';
export { LATENCY_EDGES_MS };
const FLUSH_MS = 10_000;
const KEY_PREFIX = 'ops:http:';
const KEEP_SEC = 26 * 3600;

export interface HttpWindow {
  windowMin: number;
  requests: number;
  errors: number;
  /** Share of 5xx answers, percent with one decimal (0 when no traffic). */
  errorRatePct: number;
  /** Upper edge of the bucket holding the 95th percentile; null: no traffic. */
  p95Ms: number | null;
}

/**
 * Owner 2026-10-22: the numbers behind «error rate» and «p95» on the status
 * board. Every API process counts requests in memory (no cost per request),
 * flushes a few HINCRBYs per minute bucket to Redis every 10 s, and the
 * board / watchdog read the last N minutes from there. No third parties.
 */
@Injectable()
export class HttpStatsService implements OnModuleInit, OnApplicationShutdown {
  private pending = new Map<number, Map<string, number>>();
  private timer?: NodeJS.Timeout;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  static bucketOf(ms: number): number {
    const i = LATENCY_EDGES_MS.findIndex((e) => ms <= e);
    return i === -1 ? LATENCY_EDGES_MS.length : i;
  }

  record(status: number, ms: number, now = Date.now()): void {
    const minute = Math.floor(now / 60_000);
    let m = this.pending.get(minute);
    if (!m) {
      m = new Map<string, number>();
      this.pending.set(minute, m);
    }
    const bucket = m;
    const add = (k: string) => bucket.set(k, (bucket.get(k) ?? 0) + 1);
    add('n');
    if (status >= 500) add('e');
    add(`b${HttpStatsService.bucketOf(ms)}`);
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    try {
      const pipe = pipeline(this.redis);
      for (const [minute, fields] of batch) {
        const key = KEY_PREFIX + minute;
        for (const [f, n] of fields) pipe.hincrby(key, f, n);
        pipe.expire(key, KEEP_SEC);
      }
      await pipe.exec();
    } catch {
      /* statistics only: a Redis hiccup loses ten seconds of counts */
    }
  }

  /** The last [windowMin] minutes (this process's unsent counts included). */
  async window(windowMin: number, now = Date.now()): Promise<HttpWindow> {
    await this.flush();
    const current = Math.floor(now / 60_000);
    const pipe = pipeline(this.redis);
    for (let i = 0; i < windowMin; i++)
      pipe.hgetall(KEY_PREFIX + (current - i));
    const rows = (await pipe.exec()) ?? [];
    const buckets = new Array<number>(LATENCY_EDGES_MS.length + 1).fill(0);
    let requests = 0;
    let errors = 0;
    for (const [, h] of rows) {
      const hash = (h ?? {}) as Record<string, string>;
      requests += Number(hash.n ?? 0);
      errors += Number(hash.e ?? 0);
      buckets.forEach((_, i) => (buckets[i] += Number(hash[`b${i}`] ?? 0)));
    }
    return {
      windowMin,
      requests,
      errors,
      errorRatePct:
        requests > 0 ? Math.round((errors / requests) * 1000) / 10 : 0,
      p95Ms: requests > 0 ? HttpStatsService.percentile(buckets, 0.95) : null,
    };
  }

  static percentile(buckets: number[], q: number): number {
    const total = buckets.reduce((a, b) => a + b, 0);
    const target = Math.ceil(total * q);
    let seen = 0;
    for (let i = 0; i < buckets.length; i++) {
      seen += buckets[i];
      if (seen >= target) {
        return i < LATENCY_EDGES_MS.length
          ? LATENCY_EDGES_MS[i]
          : LATENCY_EDGES_MS[LATENCY_EDGES_MS.length - 1] * 2;
      }
    }
    return 0;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}

/** Counts every answered request except the load balancer's probes. */
@Injectable()
export class HttpStatsMiddleware implements NestMiddleware {
  constructor(
    private readonly stats: HttpStatsService,
    // S12-8: per-route RED metrics + journey SLIs (feed, chat send).
    @Optional() private readonly routes?: RouteMetricsService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path.startsWith('/health')) return next();
    const started = process.hrtime.bigint();
    res.once('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      this.stats.record(res.statusCode, ms);
      this.routes?.record(
        req.method,
        (req.route as { path?: unknown } | undefined)?.path,
        res.statusCode,
        ms,
      );
    });
    next();
  }
}
