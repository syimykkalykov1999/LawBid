import {
  Injectable,
  Optional,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { LATENCY_EDGES_MS } from './latency-edges';
import { SloMetricsService } from './slo-metrics.service';

/**
 * S12-8 (observability round 12): RED metrics (Rate, Errors, Duration) for a
 * fixed allow-list of journey routes. The global p95 hides one slow endpoint
 * (the feed) inside the whole target group; the sampled request log cannot
 * prove it. One CloudWatch Embedded Metric Format line per route per minute
 * (namespace `LawBid/Routes`, dimension `Route`; metrics Requests,
 * Errors5xx, LatencyMs) — no agent, no Terraform.
 *
 * COST: 3 metrics x [ROUTES.length] routes = at most 45 custom metrics, about
 * $13.5 a month at any scale (CloudWatch bills per metric, not per sample).
 * Switch `ops.route_metrics.mode` (admin → Настройки): `off` | `on` | `auto`
 * (default: a route writes its minute only while it has 5xx answers or a
 * slow p95, so a healthy system emits nothing). `ROUTE_METRICS=off` in the
 * environment is a hard kill switch.
 *
 * The same pass feeds the journey SLIs of monitoring/slo.tf (feed open,
 * chat send, login 5xx), so those counters exist even with the metrics off.
 */
export interface RouteDef {
  /** Metric dimension value (stable; never rename). */
  name: string;
  method: string;
  /** Express route template without the `/api/v1` prefix. */
  path: string;
  /** Which journey SLI this route also feeds. */
  sli?: 'login' | 'message' | 'feed';
}

export const ROUTES: readonly RouteDef[] = [
  { name: 'auth_otp_request', method: 'POST', path: '/auth/otp/request' },
  {
    name: 'auth_otp_verify',
    method: 'POST',
    path: '/auth/otp/verify',
    sli: 'login',
  },
  {
    name: 'auth_password_login',
    method: 'POST',
    path: '/auth/password/login',
    sli: 'login',
  },
  { name: 'auth_social', method: 'POST', path: '/auth/social', sli: 'login' },
  { name: 'auth_refresh', method: 'POST', path: '/auth/refresh' },
  { name: 'feed_get', method: 'GET', path: '/feed', sli: 'feed' },
  { name: 'conversations_list', method: 'GET', path: '/conversations' },
  {
    name: 'messages_list',
    method: 'GET',
    path: '/conversations/:id/messages',
  },
  {
    name: 'message_send',
    method: 'POST',
    path: '/conversations/:id/messages',
    sli: 'message',
  },
  {
    name: 'message_delivered',
    method: 'POST',
    path: '/conversations/:id/delivered',
  },
  { name: 'post_create', method: 'POST', path: '/posts' },
  { name: 'case_create', method: 'POST', path: '/cases' },
  { name: 'my_cases', method: 'GET', path: '/users/me/cases' },
  { name: 'checkout', method: 'POST', path: '/subscriptions/checkout' },
  { name: 'pay_session', method: 'POST', path: '/pay/session' },
];

const PREFIX = '/api/v1';
const BY_KEY = new Map(ROUTES.map((r) => [`${r.method} ${r.path}`, r]));
const FLUSH_MS = 60_000;
/** A chat send slower than this counts as «ack late» (S12-3). */
export const MESSAGE_ACK_MS = 5_000;
/** A feed page slower than this counts as slow (S12-3). */
export const FEED_SLOW_MS = 1_000;
const SLOW_BUCKET_MS = 1_000;

export type RouteMetricsMode = 'off' | 'on' | 'auto';

export function parseMode(raw: unknown): RouteMetricsMode {
  return raw === 'off' || raw === 'on' || raw === 'auto' ? raw : 'auto';
}

/** The allow-list entry of a request, or null (everything else is ignored). */
export function routeOf(method: string, routePath: unknown): RouteDef | null {
  if (typeof routePath !== 'string') return null;
  const path = routePath.startsWith(PREFIX)
    ? routePath.slice(PREFIX.length)
    : routePath;
  return BY_KEY.get(`${method.toUpperCase()} ${path}`) ?? null;
}

interface Bucket {
  n: number;
  e: number;
  b: number[];
}

/** EMF line of one route-minute. Latency is up to 100 representative values
 * (bucket upper edges) so CloudWatch can compute p50/p95/p99. */
export function emfRouteLine(
  route: string,
  s: Bucket,
  now = Date.now(),
): string {
  const values: number[] = [];
  const rep = (i: number) =>
    i < LATENCY_EDGES_MS.length
      ? LATENCY_EDGES_MS[i]
      : LATENCY_EDGES_MS[LATENCY_EDGES_MS.length - 1] * 2;
  s.b.forEach((count, i) => {
    if (count <= 0) return;
    const copies = Math.max(1, Math.round((count * 100) / s.n));
    for (let k = 0; k < copies && values.length < 100; k++) values.push(rep(i));
  });
  return JSON.stringify({
    _aws: {
      Timestamp: now,
      CloudWatchMetrics: [
        {
          Namespace: 'LawBid/Routes',
          Dimensions: [['Route']],
          Metrics: [
            { Name: 'Requests', Unit: 'Count' },
            { Name: 'Errors5xx', Unit: 'Count' },
            { Name: 'LatencyMs', Unit: 'Milliseconds' },
          ],
        },
      ],
    },
    Route: route,
    Requests: s.n,
    Errors5xx: s.e,
    LatencyMs: values,
  });
}

/** Whether `auto` mode writes this minute: 5xx seen, or the p95 is slow. */
export function isAbnormal(s: Bucket): boolean {
  if (s.e > 0) return true;
  if (s.n === 0) return false;
  const target = Math.ceil(s.n * 0.95);
  let seen = 0;
  for (let i = 0; i < s.b.length; i++) {
    seen += s.b[i];
    if (seen >= target) {
      return (
        i >= LATENCY_EDGES_MS.length || LATENCY_EDGES_MS[i] > SLOW_BUCKET_MS
      );
    }
  }
  return false;
}

@Injectable()
export class RouteMetricsService
  implements OnModuleInit, OnApplicationShutdown
{
  private pending = new Map<string, Bucket>();
  private timer?: NodeJS.Timeout;
  private mode: RouteMetricsMode = 'auto';

  constructor(
    @Optional() private readonly settings?: AppSettingsService,
    @Optional() private readonly slo?: SloMetricsService,
  ) {}

  onModuleInit(): void {
    void this.refreshMode();
    this.timer = setInterval(() => {
      void this.refreshMode();
      this.flush();
    }, FLUSH_MS);
    this.timer.unref();
  }

  private async refreshMode(): Promise<void> {
    if (!this.settings) return;
    try {
      this.mode = parseMode(
        await this.settings.string('ops.route_metrics.mode'),
      );
    } catch {
      /* keep the last known mode */
    }
  }

  private enabled(): boolean {
    return process.env.ROUTE_METRICS !== 'off' && this.mode !== 'off';
  }

  /** One finished request. [routePath] is Express's `req.route.path`. */
  record(method: string, routePath: unknown, status: number, ms: number): void {
    const def = routeOf(method, routePath);
    if (!def) return;
    this.countSli(def, status, ms);
    if (!this.enabled()) return;
    let b = this.pending.get(def.name);
    if (!b) {
      b = {
        n: 0,
        e: 0,
        b: new Array<number>(LATENCY_EDGES_MS.length + 1).fill(0),
      };
      this.pending.set(def.name, b);
    }
    b.n += 1;
    if (status >= 500) b.e += 1;
    const i = LATENCY_EDGES_MS.findIndex((edge) => ms <= edge);
    b.b[i === -1 ? LATENCY_EDGES_MS.length : i] += 1;
  }

  /** S12-3: 4xx is the caller's mistake and counts for nothing. */
  private countSli(def: RouteDef, status: number, ms: number): void {
    if (!def.sli || !this.slo) return;
    const ok = status < 400;
    const serverFail = status >= 500;
    switch (def.sli) {
      case 'login':
        // Wrong codes and passwords are counted by AuthEventService; here
        // only the outage case, where no auth event is written at all.
        if (serverFail) this.slo.count('loginFail');
        break;
      case 'message':
        if (serverFail || (ok && ms > MESSAGE_ACK_MS)) {
          this.slo.count('msgAckLate');
        } else if (ok) this.slo.count('msgSent');
        break;
      case 'feed':
        if (serverFail || (ok && ms > FEED_SLOW_MS)) {
          this.slo.count('feedSlow');
        } else if (ok) this.slo.count('feedOk');
        break;
    }
  }

  flush(now = Date.now()): number {
    const batch = this.pending;
    this.pending = new Map();
    if (!this.enabled()) return 0;
    let lines = 0;
    for (const [route, s] of batch) {
      if (this.mode === 'auto' && !isAbnormal(s)) continue;
      process.stdout.write(emfRouteLine(route, s, now) + '\n');
      lines++;
    }
    return lines;
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
