import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { connect } from 'node:net';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import { SecretsService } from '../../secrets/secrets.service';
import { OpsStateService } from '../ops-state.service';
import { HttpStatsService } from '../http-stats.service';
import { SLO_REDIS_PREFIX } from '../slo-metrics.service';

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
  'turn',
  'http',
] as const;

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

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly state: OpsStateService,
    private readonly settings: AppSettingsService,
    private readonly secrets: SecretsService,
    private readonly http: HttpStatsService,
  ) {}

  private queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: { url: this.config.getOrThrow<string>('REDIS_URL') },
      });
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
      this.safe('http', () => this.httpErrors()),
    ]);
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
    const pipe = this.redis.pipeline();
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

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
