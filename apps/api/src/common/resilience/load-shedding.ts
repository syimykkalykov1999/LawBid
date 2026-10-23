import {
  Injectable,
  Optional,
  type NestMiddleware,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { AppSettingsService } from '../app-settings/app-settings.service';

/** Paths that are never shed: the load balancer's probes, payment and
 * video webhooks (the sender retries badly), and the token refresh (a
 * shed refresh would sign people out). */
const EXEMPT = /^\/(health|api\/v1\/(webhooks|auth\/(refresh|logout)))(\/|$)/;

export interface ShedLimits {
  /** 0 = off. */
  eventLoopLagMs: number;
  /** 0 = off. */
  maxInFlight: number;
}

/** Pure decision, for tests: shed when a limit is on and exceeded. */
export function shedReason(
  limits: ShedLimits,
  lagMs: number,
  inFlight: number,
): 'event_loop_lag' | 'in_flight' | null {
  if (limits.eventLoopLagMs > 0 && lagMs > limits.eventLoopLagMs) {
    return 'event_loop_lag';
  }
  if (limits.maxInFlight > 0 && inFlight >= limits.maxInFlight) {
    return 'in_flight';
  }
  return null;
}

/**
 * Owner 2026-10-23 (big platform architecture, P1, «load shedding»):
 * one overloaded instance must not turn into timeouts for everybody. When
 * the event loop is late by more than `realtime.server.shed_event_loop_lag_ms`
 * (p99 of the last second) or an instance holds more than
 * `realtime.server.shed_max_in_flight` requests, new requests get
 * `503 SERVER_BUSY` with `Retry-After` (1–5 s, random) — the apps and the
 * admin retry with backoff. Limits live in app_config (0 = off), so they
 * are changed in the admin without a release.
 */
/** No shedding this long after start: JIT, cold caches, first connections. */
const WARMUP_MS = 60_000;

@Injectable()
export class LoadSheddingService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 });
  private timers: NodeJS.Timeout[] = [];
  private limits: ShedLimits = { eventLoopLagMs: 500, maxInFlight: 0 };
  /** p99 event-loop delay of the last second, ms. */
  lagMs = 0;
  inFlight = 0;
  /** Requests turned away since start (for the logs / tests). */
  shed = 0;

  constructor(@Optional() private readonly settings?: AppSettingsService) {}

  onModuleInit(): void {
    this.histogram.enable();
    // Under jest the event loop is late because of the test runner (GC of a
    // 4 GB heap, compilation, parallel suites), not because of traffic: a
    // CI run turned real e2e requests into 503s. The sampler stays inert
    // there unless a test opts in with LOAD_SHEDDING=1.
    if (process.env.JEST_WORKER_ID && process.env.LOAD_SHEDDING !== '1') {
      return;
    }
    const startedAt = Date.now();
    let previous = 0;
    const lag = setInterval(() => {
      const p99 = this.histogram.percentile(99) / 1e6;
      const sample = Number.isFinite(p99) ? p99 : 0;
      this.histogram.reset();
      // Warm-up (JIT, cold caches, first connections) is not overload, and
      // one GC pause is not either: the published lag is the smaller of the
      // last two one-second samples, so only sustained lag sheds.
      const warmingUp = Date.now() - startedAt < WARMUP_MS;
      this.lagMs = warmingUp ? 0 : Math.min(previous, sample);
      previous = sample;
    }, 1000);
    const cfg = setInterval(() => void this.loadLimits(), 30_000);
    lag.unref();
    cfg.unref();
    this.timers = [lag, cfg];
    void this.loadLimits();
  }

  onApplicationShutdown(): void {
    for (const t of this.timers) clearInterval(t);
    this.histogram.disable();
  }

  async loadLimits(): Promise<void> {
    if (!this.settings) return;
    try {
      const [eventLoopLagMs, maxInFlight] = await Promise.all([
        this.settings.number('realtime.server.shed_event_loop_lag_ms'),
        this.settings.number('realtime.server.shed_max_in_flight'),
      ]);
      this.limits = { eventLoopLagMs, maxInFlight };
    } catch {
      // keep the previous limits
    }
  }

  decide(): 'event_loop_lag' | 'in_flight' | null {
    return shedReason(this.limits, this.lagMs, this.inFlight);
  }
}

@Injectable()
export class LoadSheddingMiddleware implements NestMiddleware {
  constructor(private readonly load: LoadSheddingService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (EXEMPT.test(req.path)) return next();
    const reason = this.load.decide();
    if (reason) {
      this.load.shed += 1;
      res
        .status(503)
        .set('Retry-After', String(1 + Math.floor(Math.random() * 5)))
        .json({
          error: {
            code: 'SERVER_BUSY',
            message: 'The server is busy. Try again in a few seconds.',
            details: { reason },
          },
        });
      return;
    }
    this.load.inFlight += 1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.load.inFlight -= 1;
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
  }
}
