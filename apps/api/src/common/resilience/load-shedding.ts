import {
  type CanActivate,
  type ExecutionContext,
  Global,
  HttpException,
  Injectable,
  Module,
  Optional,
  type NestMiddleware,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { parseSwitchMode } from '../app-settings/switch-mode';
import { trackWork } from '../ops/loop-stall';
import { SloMetricsService } from '../ops/slo-metrics.service';
import { Gradient2Limit } from './gradient2-limit';
import {
  PRIORITY_HEADER,
  SHED_PRIORITIES,
  SHED_PRIORITY_KEY,
  type ShedPriorityLevel,
  type ShedReason,
  type ShedThresholds,
  effectivePriority,
  shedDecision,
} from './shed-priority';

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

/** Pure decision of the pre-priority shedder, kept for its callers/tests:
 * shed when a limit is on and exceeded. */
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

/** All admin numbers of the shedder (app_config `realtime.server.shed_*`). */
export interface ShedSettings extends ShedThresholds {
  /** Fixed concurrency limit (Вкл) / ceiling (Авто); 0 = none. */
  maxInFlight: number;
  /** Gradient2 bounds in Авто. */
  autoMinLimit: number;
  autoMaxLimit: number;
  /** Retry-After is 1…this many seconds, random. */
  retryAfterMaxSec: number;
}

/** Defaults = app-settings defaults (used until the first settings read). */
export const SHED_DEFAULTS: ShedSettings = {
  mode: 'auto',
  lagCriticalMs: 500,
  lagStartMs: 200,
  cpuCriticalPct: 95,
  cpuStartPct: 75,
  inFlightStartPct: 70,
  maxInFlight: 0,
  autoMinLimit: 20,
  autoMaxLimit: 1000,
  retryAfterMaxSec: 5,
};

/** A shed request: answered 503 SERVER_BUSY + Retry-After by the
 * exceptions filter, which does not log it as an error (one log line per
 * shed request would add load exactly when there is too much). */
export class LoadShedException extends HttpException {
  constructor(
    readonly reason: ShedReason,
    readonly priority: ShedPriorityLevel,
    retryAfterSeconds: number,
  ) {
    super(
      {
        code: 'SERVER_BUSY',
        message: 'The server is busy. Try again in a few seconds.',
        details: { reason, priority, retryAfterSeconds, notProcessed: true },
      },
      503,
    );
  }
}

/**
 * Owner 2026-10-23 («load shedding») + item 21 (A3 / AU2, 25.11):
 * prioritized load shedding after Netflix (InfoQ 23.11.2024 and 20.11.2025;
 * concurrency-limits Gradient2, Apache-2.0, ported in gradient2-limit.ts)
 * and Google SRE ch. 21–22. Three signals, each with a start threshold for
 * the lowest priority and a critical threshold for the highest:
 * event-loop lag (p99 of the last second), event-loop utilization (the main
 * thread's CPU, measured the way @fastify/under-pressure does in its
 * «interval» mode) and requests in flight against the concurrency limit
 * (adaptive Gradient2 in Авто). Shed requests get 503 SERVER_BUSY with
 * Retry-After; the apps retry them with backoff. Mode Выкл / Вкл / Авто
 * (`realtime.server.shed_mode`, default Авто); every number is in the admin.
 */
/** No shedding this long after start: JIT, cold caches, first connections. */
const WARMUP_MS = 60_000;

type ShedCounts = Record<ShedPriorityLevel, number>;
const zeroCounts = (): ShedCounts =>
  Object.fromEntries(SHED_PRIORITIES.map((p) => [p, 0])) as ShedCounts;

@Injectable()
export class LoadSheddingService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 });
  private timers: NodeJS.Timeout[] = [];
  settings: ShedSettings = { ...SHED_DEFAULTS };
  readonly gradient = new Gradient2Limit({
    minLimit: SHED_DEFAULTS.autoMinLimit,
    initialLimit: SHED_DEFAULTS.autoMinLimit,
    maxLimit: SHED_DEFAULTS.autoMaxLimit,
  });
  /** p99 event-loop delay of the last second, ms. */
  lagMs = 0;
  /** Event-loop utilization of the last second, %. */
  cpuPct = 0;
  inFlight = 0;
  /** Requests turned away since start (for the logs / tests). */
  shed = 0;
  /** Shed this minute, by priority (the minute's metric line). */
  private minute: ShedCounts = zeroCounts();

  constructor(
    @Optional() private readonly appSettings?: AppSettingsService,
    @Optional() private readonly slo?: SloMetricsService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

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
    let previousCpu = 0;
    let elu = performance.eventLoopUtilization();
    const lag = setInterval(() => {
      const p99 = this.histogram.percentile(99) / 1e6;
      const sample = Number.isFinite(p99) ? p99 : 0;
      this.histogram.reset();
      const next = performance.eventLoopUtilization();
      const cpu = performance.eventLoopUtilization(next, elu).utilization * 100;
      elu = next;
      // Warm-up (JIT, cold caches, first connections) is not overload, and
      // one GC pause is not either: the published value is the smaller of
      // the last two one-second samples, so only sustained load sheds.
      const warmingUp = Date.now() - startedAt < WARMUP_MS;
      this.lagMs = warmingUp ? 0 : Math.min(previous, sample);
      this.cpuPct = warmingUp ? 0 : Math.min(previousCpu, cpu);
      previous = sample;
      previousCpu = cpu;
    }, 1000);
    const cfg = setInterval(() => void this.loadLimits(), 30_000);
    const metric = setInterval(() => this.flushMinute(), 60_000);
    lag.unref();
    cfg.unref();
    metric.unref();
    this.timers = [lag, cfg, metric];
    void this.loadLimits();
  }

  onApplicationShutdown(): void {
    for (const t of this.timers) clearInterval(t);
    this.histogram.disable();
    this.flushMinute();
  }

  async loadLimits(): Promise<void> {
    const s = this.appSettings;
    if (!s) return;
    try {
      const n = (k: Parameters<AppSettingsService['number']>[0]) => s.number(k);
      const [
        mode,
        lagCriticalMs,
        lagStartMs,
        cpuCriticalPct,
        cpuStartPct,
        inFlightStartPct,
        maxInFlight,
        autoMinLimit,
        autoMaxLimit,
        retryAfterMaxSec,
      ] = await Promise.all([
        s.raw('realtime.server.shed_mode'),
        n('realtime.server.shed_event_loop_lag_ms'),
        n('realtime.server.shed_lag_start_ms'),
        n('realtime.server.shed_cpu_critical_pct'),
        n('realtime.server.shed_cpu_start_pct'),
        n('realtime.server.shed_in_flight_start_pct'),
        n('realtime.server.shed_max_in_flight'),
        n('realtime.server.shed_auto_min_limit'),
        n('realtime.server.shed_auto_max_limit'),
        n('realtime.server.shed_retry_after_max_seconds'),
      ]);
      this.applySettings({
        mode: parseSwitchMode(mode),
        lagCriticalMs,
        lagStartMs,
        cpuCriticalPct,
        cpuStartPct,
        inFlightStartPct,
        maxInFlight,
        autoMinLimit,
        autoMaxLimit,
        retryAfterMaxSec,
      });
    } catch {
      // keep the previous limits
    }
  }

  applySettings(next: ShedSettings): void {
    this.settings = next;
    this.gradient.setBounds(next.autoMinLimit, next.autoMaxLimit);
  }

  /** The concurrency limit in force: Вкл = the fixed number, Авто = the
   * adaptive limit (capped by the fixed one when it is set). */
  currentLimit(): number {
    const { mode, maxInFlight } = this.settings;
    if (mode === 'on') return maxInFlight;
    if (mode === 'auto') {
      const adaptive = this.gradient.limit;
      return maxInFlight > 0 ? Math.min(adaptive, maxInFlight) : adaptive;
    }
    return 0;
  }

  /** @param inFlight requests in flight besides the one being decided */
  decideFor(level: ShedPriorityLevel, inFlight: number): ShedReason | null {
    return shedDecision(
      level,
      {
        lagMs: this.lagMs,
        cpuPct: this.cpuPct,
        inFlight,
        limit: this.currentLimit(),
      },
      this.settings,
    );
  }

  /** Pre-priority entry point: a normal request's decision. */
  decide(): ShedReason | null {
    return this.decideFor('degraded', this.inFlight);
  }

  /** Gradient2 sample of one finished (not shed) request. */
  sample(rttMs: number, inFlightAtStart: number): void {
    if (this.settings.mode !== 'auto') return;
    this.gradient.update(rttMs, inFlightAtStart);
  }

  retryAfterSec(): number {
    const max = Math.max(1, Math.trunc(this.settings.retryAfterMaxSec || 1));
    return 1 + Math.floor(Math.random() * max);
  }

  recordShed(level: ShedPriorityLevel): void {
    this.shed += 1;
    this.minute[level] += 1;
    this.slo?.count(level === 'critical' ? 'shedCritical' : 'shedLow');
  }

  /** One warn line a minute while something was shed (not per request). */
  flushMinute(): ShedCounts | null {
    const counts = this.minute;
    if (SHED_PRIORITIES.every((p) => counts[p] === 0)) return null;
    this.minute = zeroCounts();
    this.logger?.warn(
      {
        metric: 'load_shed',
        shed: counts,
        mode: this.settings.mode,
        limit: this.currentLimit(),
        inFlight: this.inFlight,
        lagMs: Math.round(this.lagMs),
        cpuPct: Math.round(this.cpuPct),
      },
      'load shedding: requests turned away this minute',
    );
    return counts;
  }
}

const START = Symbol('shedStart');
type Tracked = Request & {
  [START]?: { at: number; inFlight: number; shed: boolean };
};

/** Counts requests in flight (all of them) and feeds Gradient2 the RTT of
 * every request that was served. The decision is LoadSheddingGuard's: it
 * runs before every other guard and knows the route's priority. */
@Injectable()
export class LoadSheddingMiddleware implements NestMiddleware {
  constructor(private readonly load: LoadSheddingService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (EXEMPT.test(req.path)) return next();
    const tracked = req as Tracked;
    tracked[START] = {
      at: performance.now(),
      inFlight: this.load.inFlight,
      shed: false,
    };
    this.load.inFlight += 1;
    // F3 (14.11): open requests are named in the «event loop stall» line
    // (loop-stall.ts): route template once routed, else the path (no query).
    const endWork = trackWork(() => {
      const route = (req as { route?: { path?: string } }).route?.path;
      return `${req.method} ${route ? `${req.baseUrl}${route}` : req.path}`;
    });
    let done = false;
    const finish = (served: boolean) => {
      if (done) return;
      done = true;
      this.load.inFlight -= 1;
      endWork();
      const start = tracked[START];
      // Java listener: onSuccess samples, a rejected or dropped one does not.
      if (served && start && !start.shed) {
        this.load.sample(performance.now() - start.at, start.inFlight);
      }
    };
    res.once('finish', () => finish(true));
    res.once('close', () => finish(false));
    next();
  }
}

/** Global guard, registered before every other APP_GUARD (throttler, app
 * version, JWT): a shed request costs no token check and no database. */
@Injectable()
export class LoadSheddingGuard implements CanActivate {
  constructor(
    private readonly load: LoadSheddingService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Tracked>();
    if (EXEMPT.test(req.path)) return true;
    if (this.load.settings.mode === 'off') return true;
    const level = effectivePriority(
      this.reflector.getAllAndOverride<ShedPriorityLevel | undefined>(
        SHED_PRIORITY_KEY,
        [context.getHandler(), context.getClass()],
      ),
      req.headers?.[PRIORITY_HEADER],
      req.path,
    );
    const others = req[START]?.inFlight ?? this.load.inFlight;
    const reason = this.load.decideFor(level, others);
    if (!reason) return true;
    if (req[START]) req[START].shed = true;
    this.load.recordShed(level);
    throw new LoadShedException(reason, level, this.load.retryAfterSec());
  }
}

/** Global: the guard is an APP_GUARD of this module, imported in AppModule
 * before ThrottlerModule so it runs first. */
@Global()
@Module({
  providers: [
    LoadSheddingService,
    { provide: APP_GUARD, useClass: LoadSheddingGuard },
  ],
  exports: [LoadSheddingService],
})
export class LoadSheddingModule {}
