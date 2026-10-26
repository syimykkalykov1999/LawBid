import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { connect } from 'node:net';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import { SecretsService } from '../../secrets/secrets.service';
import { fetchCloudflareTurn } from '../../../modules/calls/cloudflare-turn';
import { CloudflareSfuProvider } from '../../../modules/calls/cloudflare-sfu.provider';
import {
  CloudflareTransport,
  type CfPart,
} from '../../../modules/calls/cloudflare-transport';
import { OpsStateService } from '../ops-state.service';
import { HttpStatsService } from '../http-stats.service';
import { RealtimeStatsService } from '../realtime-stats.service';
import { SLO_REDIS_PREFIX } from '../slo-metrics.service';
import { bullOptions } from '../../../redis/redis-connection';
import { pipeline } from '../../../redis/redis-cluster-safe';
import { CircuitBreaker } from '../../resilience/resilience';
import {
  USAGE_SNAPSHOT_KEY,
  type UsageSnapshot,
} from '../../../jobs/handlers/usage-poll.job';

export type ProbeStatus = 'green' | 'yellow' | 'red' | 'grey';

export interface ProbeResult {
  key: string;
  status: ProbeStatus;
  detail: Record<string, unknown>;
}

const PROBE_TIMEOUT_MS = 3_000;
const STRIPE_QUEUE = 'stripe-webhooks';
const STRIPE_DLQ = 'stripe-webhooks-dlq';
const PUSH_QUEUE_NAME = 'push';

/** Components the watchdog treats as «down» when red (storage, backup and
 * cost have their own, slower alerts). */
export const WATCHED = [
  'worker',
  'database',
  'redis',
  'queues',
  'stripe_webhooks',
  'push',
  // Owner 2026-10-24: calls relay through Cloudflare now; our own coturn
  // (the `turn` probe) is shown but not paged on.
  'cloudflare_turn',
  'cloudflare_sfu',
  'r2',
  'http',
] as const;

/** Outside services are asked at most this often (Cloudflare has no status
 * endpoint of its own: each probe is a real, tiny request). */
export const OUTSIDE_PROBE_CACHE_MS = 120_000;
/** The probe credential lives only this long. */
const PROBE_TURN_TTL_SEC = 300;

function withTimeout<T>(p: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
      t.unref();
    }),
  ]).finally(() => clearTimeout(t));
}

/** TCP connect to host:port; resolves the connect time in ms. */
export function tcpProbe(
  host: string,
  port: number,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const sock = connect({ host, port });
    const fail = (e: Error) => {
      sock.destroy();
      reject(e);
    };
    sock.setTimeout(timeoutMs, () => fail(new Error('timeout')));
    sock.once('error', fail);
    sock.once('connect', () => {
      sock.destroy();
      resolve(Date.now() - started);
    });
  });
}

/** "turn:host:3478?transport=udp,turns:h2:5349" → first {host, port}. */
export function firstTurnTarget(
  urls: string,
): { host: string; port: number } | null {
  for (const raw of urls.split(',')) {
    const m = /^(turns?):\[?([^\]\s/?:]+)\]?(?::(\d+))?/i.exec(raw.trim());
    if (m) {
      return {
        host: m[2],
        port: m[3]
          ? Number(m[3])
          : m[1].toLowerCase() === 'turns'
            ? 5349
            : 3478,
      };
    }
  }
  return null;
}

/**
 * Owner 2026-10-22: the probes behind «Состояние системы». Each probe has a
 * short timeout and its own try/catch, so one broken part never hides the
 * others. Used by the admin board (API) and the watchdog (worker): same
 * numbers, same colours.
 */
@Injectable()
export class StatusProbesService implements OnModuleDestroy {
  private queues = new Map<string, Queue>();
  private outside = new Map<
    string,
    { at: number; value: Omit<ProbeResult, 'key'> }
  >();
  private sfu?: CloudflareSfuProvider;
  private cfTransport?: CloudflareTransport;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly state: OpsStateService,
    private readonly settings: AppSettingsService,
    private readonly secrets: SecretsService,
    private readonly http: HttpStatsService,
    @Optional() private readonly realtime?: RealtimeStatsService,
  ) {}

  private queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(
        name,
        bullOptions(name, this.config.getOrThrow<string>('REDIS_URL')),
      );
      this.queues.set(name, q);
    }
    return q;
  }

  private async safe(
    key: string,
    fn: () => Promise<Omit<ProbeResult, 'key'>>,
  ): Promise<ProbeResult> {
    try {
      return { key, ...(await fn()) };
    } catch (e) {
      return { key, status: 'red', detail: { error: (e as Error).message } };
    }
  }

  /** The probes the board adds on top of the older «Здоровье» ones. */
  async extra(): Promise<ProbeResult[]> {
    return Promise.all([
      this.safe('stripe_webhooks', () => this.stripeWebhooks()),
      this.safe('push', () => this.pushDelivery()),
      this.safe('turn', () => this.turn()),
      this.safe('cloudflare_turn', () => this.cloudflareTurn()),
      this.safe('cloudflare_sfu', () => this.cloudflareSfu()),
      this.safe('r2', () => this.r2()),
      this.safe('http', () => this.httpErrors()),
      this.safe('realtime', () => this.realtimeHealth()),
      this.safe('breakers', () => this.breakers()),
      this.safe('cloudflare_usage', () => this.usage('cloudflare')),
      this.safe('bunny_usage', () => this.usage('bunny')),
    ]);
  }

  /** Batch C item 6: circuit breakers of outside services (SES, Stripe,
   * Twilio, FCM, Bunny). Yellow while any is open in this process. */
  private breakers(): Promise<Omit<ProbeResult, 'key'>> {
    const all = CircuitBreaker.snapshot();
    const open = all.filter((b) => b.state !== 'closed');
    return Promise.resolve({
      status: open.length > 0 ? 'yellow' : 'green',
      detail: {
        open: open.map((b) => b.service),
        tracked: all.map((b) => b.service),
      },
    });
  }

  /** Batch C items 11 and 16: yesterday's usage poll (`ops.usage-poll`). */
  private async usage(
    which: 'cloudflare' | 'bunny',
  ): Promise<Omit<ProbeResult, 'key'>> {
    const raw = await this.redis.get(USAGE_SNAPSHOT_KEY);
    const snap = raw ? (JSON.parse(raw) as UsageSnapshot) : null;
    const part = snap?.[which];
    if (!snap || !part) {
      return { status: 'grey', detail: { configured: false } };
    }
    if (!part.ok) {
      return {
        status: 'yellow',
        detail: { configured: true, ok: false, error: part.error, at: snap.at },
      };
    }
    const p = part as {
      level?: string;
      bandwidthLevel?: string;
      storageLevel?: string;
    };
    const levels = [p.level, p.bandwidthLevel, p.storageLevel];
    const status = levels.includes('crit')
      ? 'red'
      : levels.includes('warn')
        ? 'yellow'
        : 'green';
    return { status, detail: { configured: true, at: snap.at, ...part } };
  }

  /** Everything the watchdog watches (see [WATCHED]). */
  async watched(now = new Date()): Promise<ProbeResult[]> {
    const core = await Promise.all([
      this.safe('worker', () => this.worker(now)),
      this.safe('database', () => this.database()),
      this.safe('redis', () => this.redisProbe()),
      this.safe('queues', () => this.queuesProbe(now)),
    ]);
    return [...core, ...(await this.extra())];
  }

  private async worker(now: Date): Promise<Omit<ProbeResult, 'key'>> {
    const hb = await this.state.workerHeartbeat();
    const t = hb?.at ? Date.parse(hb.at) : NaN;
    const age = Number.isNaN(t)
      ? null
      : Math.max(0, Math.round((now.getTime() - t) / 1000));
    const status: ProbeStatus =
      age === null
        ? 'red'
        : age <= 90
          ? 'green'
          : age <= 180
            ? 'yellow'
            : 'red';
    return { status, detail: { lastBeatSec: age, mode: hb?.mode ?? null } };
  }

  private async database(): Promise<Omit<ProbeResult, 'key'>> {
    const slowMs = await this.settings.number('ops.db_slow_ms');
    const started = Date.now();
    await withTimeout(this.prisma.$queryRaw`SELECT 1`);
    const latencyMs = Date.now() - started;
    return {
      status: latencyMs > slowMs ? 'yellow' : 'green',
      detail: { latencyMs, slowMs },
    };
  }

  private async redisProbe(): Promise<Omit<ProbeResult, 'key'>> {
    const started = Date.now();
    await withTimeout(this.redis.ping());
    const latencyMs = Date.now() - started;
    return {
      status: latencyMs > 200 ? 'yellow' : 'green',
      detail: { latencyMs },
    };
  }

  private async queueStats(name: string, now: Date) {
    const q = this.queue(name);
    const c = await withTimeout(q.getJobCounts('waiting', 'failed'));
    const [oldest] = await withTimeout(q.getWaiting(0, 0));
    return {
      waiting: c.waiting ?? 0,
      failed: c.failed ?? 0,
      oldestSec: oldest
        ? Math.max(0, Math.floor((now.getTime() - oldest.timestamp) / 1000))
        : 0,
    };
  }

  private async queuesProbe(now: Date): Promise<Omit<ProbeResult, 'key'>> {
    // The two busiest consumers; the full list is on the older «Очереди» card.
    const cron = await this.queueStats('cron', now);
    return {
      status:
        cron.oldestSec > 300 ? 'red' : cron.oldestSec > 60 ? 'yellow' : 'green',
      detail: { ...cron },
    };
  }

  private async stripeWebhooks(): Promise<Omit<ProbeResult, 'key'>> {
    const now = new Date();
    const main = await this.queueStats(STRIPE_QUEUE, now);
    const dlq = await withTimeout(
      this.queue(STRIPE_DLQ).getJobCounts('waiting'),
    );
    const dead = dlq.waiting ?? 0;
    // Lag = how long the oldest event waits for the worker.
    const status: ProbeStatus =
      main.oldestSec > 900 || dead > 5
        ? 'red'
        : main.oldestSec > 300 || dead > 0 || main.failed > 0
          ? 'yellow'
          : 'green';
    return {
      status,
      detail: {
        lagSec: main.oldestSec,
        waiting: main.waiting,
        failed: main.failed,
        dlq: dead,
      },
    };
  }

  private async pushDelivery(): Promise<Omit<ProbeResult, 'key'>> {
    const now = new Date();
    const queue = await this.queueStats(PUSH_QUEUE_NAME, now);
    const current = Math.floor(now.getTime() / 60_000);
    const pipe = pipeline(this.redis);
    for (let i = 0; i < 15; i++) pipe.hgetall(SLO_REDIS_PREFIX + (current - i));
    const rows = (await pipe.exec()) ?? [];
    let ok = 0;
    let failed = 0;
    for (const [, h] of rows) {
      const hash = (h ?? {}) as Record<string, string>;
      ok += Number(hash.pushOk ?? 0);
      failed += Number(hash.pushFailed ?? 0);
    }
    const total = ok + failed;
    const failedPct = total > 0 ? Math.round((failed / total) * 1000) / 10 : 0;
    // A rate means something only with enough pushes behind it.
    const bad = total >= 20 && failedPct >= 50;
    const poor = total >= 20 && failedPct >= 20;
    const stuck = queue.oldestSec > 300;
    const status: ProbeStatus =
      bad || stuck ? 'red' : poor || queue.oldestSec > 60 ? 'yellow' : 'green';
    return {
      status,
      detail: {
        windowMin: 15,
        ok,
        failed,
        failedPct,
        queueOldestSec: queue.oldestSec,
      },
    };
  }

  /** One real answer per [OUTSIDE_PROBE_CACHE_MS], failures included. */
  private async cached(
    key: string,
    fn: () => Promise<Omit<ProbeResult, 'key'>>,
  ): Promise<Omit<ProbeResult, 'key'>> {
    const hit = this.outside.get(key);
    if (hit && Date.now() - hit.at < OUTSIDE_PROBE_CACHE_MS) return hit.value;
    const value = await fn();
    this.outside.set(key, { at: Date.now(), value });
    return value;
  }

  /**
   * Owner 2026-10-26: which path NEW calls take right now, for the status
   * dot: `cloudflare` (primary) or `own` (automatic backup / forced). Read
   * from the breaker shared in Redis, so every API instance agrees. While
   * the breaker is open the board also gives it its probe (at most one a
   * minute fleet-wide), so Cloudflare comes back even with no calls.
   */
  private async callPath(
    part: CfPart,
    probe: () => Promise<unknown>,
  ): Promise<Record<string, unknown>> {
    this.cfTransport ??= new CloudflareTransport(this.redis, this.settings);
    const t = this.cfTransport;
    const mode = await t.mode();
    let st = await t.state(part);
    if (st.open && mode !== 'own') {
      if (await t.maybeProbe(part, probe)) st = await t.state(part);
    }
    const path =
      mode === 'own'
        ? 'own'
        : mode === 'cloudflare' || !st.open
          ? 'cloudflare'
          : 'own';
    return {
      transport: mode,
      path,
      breaker: st.open ? 'open' : 'closed',
      breakerSince: st.since ? new Date(st.since).toISOString() : null,
      failures: st.failures,
    };
  }

  /** Cloudflare Realtime TURN: asks for a short-lived login, exactly what a
   * call does. Grey when its keys are not set. */
  private async cloudflareTurn(): Promise<Omit<ProbeResult, 'key'>> {
    const f = (await this.secrets.get('cloudflare_turn'))?.fields ?? {};
    const keyId = (
      f.keyId ??
      this.config.get<string>('CLOUDFLARE_TURN_KEY_ID') ??
      ''
    ).trim();
    const token = (
      f.apiToken ??
      this.config.get<string>('CLOUDFLARE_TURN_API_TOKEN') ??
      ''
    ).trim();
    if (!keyId || !token) {
      return { status: 'grey', detail: { configured: false } };
    }
    const probe = await this.cached('cloudflare_turn', async () => {
      const started = Date.now();
      try {
        await fetchCloudflareTurn(keyId, token, PROBE_TURN_TTL_SEC);
        const ms = Date.now() - started;
        return {
          status: ms > 1500 ? 'yellow' : 'green',
          detail: { configured: true, ok: true, answerMs: ms },
        };
      } catch (e) {
        return {
          status: 'red',
          detail: {
            configured: true,
            ok: false,
            // The message never holds the token.
            error: (e as Error).message,
          },
        };
      }
    });
    const path = await this.callPath('turn', () =>
      fetchCloudflareTurn(keyId, token, PROBE_TURN_TTL_SEC),
    );
    return this.withPath(probe, path);
  }

  /** Cloudflare Realtime SFU (group calls): opens a session, as a group
   * call does. Grey unless keys are set and group calls use Cloudflare. */
  private async cloudflareSfu(): Promise<Omit<ProbeResult, 'key'>> {
    this.sfu ??= new CloudflareSfuProvider(this.secrets, this.config);
    if (!(await this.sfu.isConfigured())) {
      return { status: 'grey', detail: { configured: false } };
    }
    // Owner 2026-10-26: SFU keys set = Cloudflare carries group calls,
    // unless the admin chose our own path (`calls.transport` = own).
    let selected = true;
    try {
      selected = (await this.settings.string('calls.transport')) !== 'own';
    } catch {
      selected = true;
    }
    if (!selected) {
      return {
        status: 'grey',
        detail: {
          configured: true,
          inUse: false,
          transport: 'own',
          path: 'own',
        },
      };
    }
    const sfu = this.sfu;
    const path = await this.callPath('sfu', () => sfu.probe());
    const probe = await this.cached('cloudflare_sfu', async () => {
      const started = Date.now();
      const ok = await sfu.healthy();
      return ok
        ? {
            status: 'green' as const,
            detail: {
              configured: true,
              inUse: true,
              ok: true,
              answerMs: Date.now() - started,
            },
          }
        : {
            status: 'red' as const,
            detail: {
              configured: true,
              inUse: true,
              ok: false,
              error: 'Cloudflare SFU did not open a session',
            },
          };
    });
    return this.withPath(probe, path);
  }

  /** The probe result plus the active call path; the dot is at least yellow
   * while new calls run on our own backup path. */
  private withPath(
    probe: Omit<ProbeResult, 'key'>,
    path: Record<string, unknown>,
  ): Omit<ProbeResult, 'key'> {
    const backup = path.path === 'own' && path.transport !== 'own';
    return {
      status: backup && probe.status === 'green' ? 'yellow' : probe.status,
      detail: { ...probe.detail, ...path },
    };
  }

  /** R2 public media: a HEAD of a known-missing key on the public domain
   * (404 is a good answer: the edge and R2 are both there). Grey unless R2
   * has keys and `media.public_store` is r2. */
  private async r2(): Promise<Omit<ProbeResult, 'key'>> {
    const f = (await this.secrets.get('cloudflare_r2'))?.fields ?? {};
    const base = f.publicBaseUrl?.trim().replace(/\/+$/, '');
    if (!base || !f.bucket) {
      return { status: 'grey', detail: { configured: false } };
    }
    let selected = false;
    try {
      selected = (await this.settings.string('media.public_store')) === 'r2';
    } catch {
      selected = false;
    }
    if (!selected) {
      return { status: 'grey', detail: { configured: true, inUse: false } };
    }
    return this.cached('r2', async () => {
      const started = Date.now();
      try {
        const res = await withTimeout(
          fetch(`${base}/ops/health-probe`, { method: 'HEAD' }),
        );
        const ms = Date.now() - started;
        if (res.status >= 500) {
          return {
            status: 'red' as const,
            detail: { configured: true, inUse: true, httpStatus: res.status },
          };
        }
        return {
          status: ms > 1500 ? ('yellow' as const) : ('green' as const),
          detail: {
            configured: true,
            inUse: true,
            httpStatus: res.status,
            answerMs: ms,
          },
        };
      } catch (e) {
        return {
          status: 'red' as const,
          detail: {
            configured: true,
            inUse: true,
            error: (e as Error).message,
          },
        };
      }
    });
  }

  private async turn(): Promise<Omit<ProbeResult, 'key'>> {
    const f = (await this.secrets.get('turn'))?.fields ?? {};
    const urls = f.urls ?? this.config.get<string>('TURN_URLS') ?? '';
    const target = firstTurnTarget(urls);
    if (!target) return { status: 'grey', detail: { configured: false } };
    try {
      const ms = await tcpProbe(target.host, target.port);
      return {
        status: ms > 1000 ? 'yellow' : 'green',
        detail: { configured: true, host: target.host, connectMs: ms },
      };
    } catch (e) {
      return {
        status: 'red',
        detail: {
          configured: true,
          host: target.host,
          error: (e as Error).message,
        },
      };
    }
  }

  private async httpErrors(): Promise<Omit<ProbeResult, 'key'>> {
    const w = await this.http.window(5);
    const day = await this.http.window(60);
    // Under 30 requests in 5 minutes a percentage is noise.
    const enough = w.requests >= 30;
    const status: ProbeStatus = !enough
      ? 'green'
      : w.errorRatePct >= 10
        ? 'red'
        : w.errorRatePct >= 2 || (w.p95Ms ?? 0) >= 2500
          ? 'yellow'
          : 'green';
    return {
      status,
      detail: {
        requests5m: w.requests,
        errors5m: w.errors,
        errorRatePct: w.errorRatePct,
        p95Ms: w.p95Ms,
        requests1h: day.requests,
        errorRate1hPct: day.errorRatePct,
        p95Ms1h: day.p95Ms,
      },
    };
  }

  /** Owner 2026-10-23: how often live connections drop and come back.
   * Never watched by the watchdog (a reconnect wave is not an outage). */
  private async realtimeHealth(): Promise<Omit<ProbeResult, 'key'>> {
    if (!this.realtime) return { status: 'grey', detail: {} };
    const w = await this.realtime.window(5);
    const status: ProbeStatus =
      w.reconnectsPerMin >= 300
        ? 'red'
        : w.reconnectsPerMin >= 30
          ? 'yellow'
          : 'green';
    return {
      status,
      detail: {
        connects5m: w.connects,
        reconnects5m: w.reconnects,
        reconnectsPerMin: w.reconnectsPerMin,
        disconnects5m: w.disconnects,
        disconnectReasons: w.disconnectReasons,
        authExpiringSent5m: w.authExpiringSent,
        authRefreshed5m: w.authRefreshed,
        authExpiredDisconnects5m: w.authExpiredDisconnects,
        goingAwaySent5m: w.goingAwaySent,
        syncs5m: w.syncs,
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
