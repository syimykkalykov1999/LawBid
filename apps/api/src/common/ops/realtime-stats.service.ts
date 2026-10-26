import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { pipeline } from '../../redis/redis-cluster-safe';

const FLUSH_MS = 10_000;
const KEY_PREFIX = 'ops:ws:';
const KEEP_SEC = 26 * 3600;

export type RealtimeCounter =
  | 'connect'
  | 'reconnect'
  | 'auth_expiring'
  | 'auth_refresh'
  | 'auth_expired'
  | 'going_away'
  | 'sync';

export interface RealtimeWindow {
  windowMin: number;
  connects: number;
  reconnects: number;
  reconnectsPerMin: number;
  authExpiringSent: number;
  authRefreshed: number;
  authExpiredDisconnects: number;
  goingAwaySent: number;
  syncs: number;
  disconnects: number;
  /** Socket.IO disconnect reason → count ("transport close", "ping
   * timeout", "server namespace disconnect" …). */
  disconnectReasons: Record<string, number>;
}

/**
 * Owner 2026-10-23 («связь пропала»): how healthy the live connection
 * is, counted per minute like HttpStatsService — in memory, flushed to
 * Redis every 10 s, read by the status board. Every number is a count of
 * something that happened; nothing here touches a socket.
 */
@Injectable()
export class RealtimeStatsService
  implements OnModuleInit, OnApplicationShutdown
{
  private pending = new Map<number, Map<string, number>>();
  private timer?: NodeJS.Timeout;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  record(counter: RealtimeCounter, now = Date.now()): void {
    this.add(counter, now);
  }

  recordDisconnect(reason: string, now = Date.now()): void {
    this.add('disconnect', now);
    // The reason is a short fixed Socket.IO string; cap it anyway.
    this.add(`d:${reason.slice(0, 40)}`, now);
  }

  private add(field: string, now: number): void {
    const minute = Math.floor(now / 60_000);
    let m = this.pending.get(minute);
    if (!m) {
      m = new Map<string, number>();
      this.pending.set(minute, m);
    }
    m.set(field, (m.get(field) ?? 0) + 1);
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

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  /** The last [windowMin] minutes of every instance. */
  async window(windowMin: number, now = Date.now()): Promise<RealtimeWindow> {
    await this.flush();
    const current = Math.floor(now / 60_000);
    const pipe = pipeline(this.redis);
    for (let i = 0; i < windowMin; i++) {
      pipe.hgetall(KEY_PREFIX + (current - i));
    }
    const rows = (await pipe.exec()) ?? [];
    const sum: Record<string, number> = {};
    for (const [, h] of rows) {
      for (const [k, v] of Object.entries(
        (h ?? {}) as Record<string, string>,
      )) {
        sum[k] = (sum[k] ?? 0) + Number(v);
      }
    }
    const reasons: Record<string, number> = {};
    for (const [k, v] of Object.entries(sum)) {
      if (k.startsWith('d:')) reasons[k.slice(2)] = v;
    }
    return {
      windowMin,
      connects: sum.connect ?? 0,
      reconnects: sum.reconnect ?? 0,
      reconnectsPerMin:
        Math.round(((sum.reconnect ?? 0) / windowMin) * 10) / 10,
      authExpiringSent: sum.auth_expiring ?? 0,
      authRefreshed: sum.auth_refresh ?? 0,
      authExpiredDisconnects: sum.auth_expired ?? 0,
      goingAwaySent: sum.going_away ?? 0,
      syncs: sum.sync ?? 0,
      disconnects: sum.disconnect ?? 0,
      disconnectReasons: reasons,
    };
  }
}
