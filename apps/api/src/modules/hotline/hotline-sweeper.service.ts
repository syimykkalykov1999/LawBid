import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  bandOf,
  hotlineCounterBandsFrom,
} from '../../common/app-settings/hotline-settings';
import type Redis from 'ioredis';
import { pipeline } from '../../redis/redis-cluster-safe';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { HotlineService } from './hotline.service';

/** Socket.IO room of one counter key (`b:<bucket>` or `l:<lang>`). */
export const hotlineCounterRoom = (key: string) => `hotline:c:${key}`;

const BATCH = 500;

/**
 * Owner row 87: the hotline's clock. Every API instance ticks every
 * `hotline.sweep_interval_ms`, but only the one that takes the Valkey lock
 * does the work (SET NX PX), so 1 or 100 instances cost the same — the
 * «Авто» scaling needs nothing else. Nothing runs while the flag is off.
 *   1. offers older than `offer_timeout_sec` → next attorney;
 *   2. attorneys without a heartbeat → off the line;
 *   3. waiting clients without a heartbeat / expired «Сообщите мне» → closed;
 *   4. connected calls nobody confirms (both gone) or over the length limit;
 *   5. paused attorneys → back;
 *   6. «Адвокат на линии» notices not claimed in time → after N, closed;
 *   7. buckets with free attorneys and waiters → batch pairing, then
 *      notices for offline subscribers (rate `notify_rate_per_sec`);
 *   8. counters of watched buckets, every `counters_interval_sec`, only the
 *      changed banded values, one message per room.
 */
@Injectable()
export class HotlineSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private intervalMs = 1000;

  constructor(
    private readonly hotline: HotlineService,
    private readonly realtime: RealtimePublisher,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HotlineSweeper.name);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.schedule();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      void this.tick()
        .catch((err: unknown) =>
          this.logger.warn(
            { err: err instanceof Error ? err.message : err },
            'hotline sweep failed',
          ),
        )
        .finally(() => this.schedule());
    }, this.intervalMs);
    this.timer.unref();
  }

  /** One pass; returns false when another instance holds the lock. */
  async tick(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      if (!(await this.hotline.enabled())) return false;
      const { s } = await this.hotline.cfg();
      this.intervalMs = s['hotline.sweep_interval_ms'];
      const h = this.hotline;
      const redis = h.redis;
      const lock = await redis.set(
        h.k.tick,
        '1',
        'PX',
        Math.max(100, this.intervalMs - 50),
        'NX',
      );
      if (lock !== 'OK') return false;
      const now = h.nowMs();
      await this.sweep(redis, now);
      return true;
    } finally {
      this.running = false;
    }
  }

  /** The work of one tick (public for the tests, which pass their clock). */
  async sweep(redis: Redis, now: number): Promise<void> {
    const h = this.hotline;
    const k = h.k;
    const { s, raw } = await h.cfg();
    const due = (key: string) =>
      redis.zrangebyscore(key, '-inf', now, 'LIMIT', 0, BATCH);

    for (const m of await due(k.dl)) {
      const req = m.slice(2);
      const st = await h.store.requestState(req);
      if (st?.startsWith('o|')) await h.offerTimedOut(req, st.slice(2));
      else await redis.zrem(k.dl, m);
    }
    for (const lw of await due(k.alive)) await h.goOffline(lw, 'lost');
    for (const req of await due(k.calive)) {
      const offline = await h.store.isOffline(req);
      await h.closeRequest(req, offline ? 'notify_expired' : 'lost');
      await redis.zrem(k.calive, req);
    }
    for (const req of await due(k.conn)) {
      await h.endCall(req, 'lost');
      await redis.zrem(k.conn, req);
    }
    for (const req of await due(`${k.p}:connmax`)) {
      await h.endCall(req, 'time_limit');
      await redis.zrem(`${k.p}:connmax`, req);
    }
    for (const lw of await due(k.pause)) await h.unpause(lw);
    for (const req of await due(k.ntf)) {
      await redis.zrem(k.ntf, req);
      const sent = Number((await redis.hget(k.natt, req)) ?? 0);
      if (sent >= s['hotline.notify_max_attempts']) {
        // «Мы не дозвонились, оставьте заявку снова»
        await h.closeRequest(req, 'notify_exhausted');
      }
    }
    let budget = Math.max(
      1,
      Math.floor((s['hotline.notify_rate_per_sec'] * this.intervalMs) / 1000),
    );
    const claimMs = s['hotline.notify_claim_sec'] * 1000;
    for (const b of await due(k.dirty)) {
      await redis.zrem(k.dirty, b);
      for (const [req, lw] of await h.store.pairBucket(
        b,
        now,
        now + s['hotline.offer_timeout_sec'] * 1000,
        100,
      )) {
        await h.afterReserve(req, lw, 0);
      }
      if (budget <= 0) {
        await redis.zadd(k.dirty, now + 1000, b);
        continue;
      }
      const pick = await h.store.notifyPick(
        b,
        now,
        s['hotline.notify_overbook_pct'],
        now + claimMs,
        budget,
      );
      budget -= pick.picked.length;
      for (const req of pick.picked) {
        await h.notify(req, s['hotline.notify_claim_sec']);
      }
      if (pick.free > 0 && (pick.outstanding > 0 || pick.picked.length > 0)) {
        // look again when these notices run out
        await redis.zadd(k.dirty, now + claimMs, b);
      }
    }
    await redis.zremrangebyscore(k.rqd, '-inf', now);
    const online = await redis.zcount(k.alive, now, '+inf');
    const aggKey = k.agg(h.hour(now));
    const peak = Number((await redis.hget(aggKey, 'peakOnline')) ?? 0);
    if (online > peak) await redis.hset(aggKey, 'peakOnline', online);

    const every = s['hotline.counters_interval_sec'] * 1000;
    if ((await redis.set(k.lastCounters, '1', 'PX', every, 'NX')) === 'OK') {
      await this.pushCounters(redis, now, hotlineCounterBandsFrom(raw));
    }
  }

  /** Changed banded counters of the watched keys → their rooms. */
  async pushCounters(
    redis: Redis,
    now: number,
    bands: number[],
  ): Promise<number> {
    const k = this.hotline.k;
    await redis.zremrangebyscore(k.watch, '-inf', now);
    const keys = await redis.zrangebyscore(
      k.watch,
      now,
      '+inf',
      'LIMIT',
      0,
      1000,
    );
    if (keys.length === 0) return 0;
    const p = pipeline(redis);
    for (const key of keys) {
      const id = key.slice(2);
      if (key.startsWith('b:')) {
        p.scard(k.bucketLawyers(id));
        p.zcard(k.queue(id));
      } else {
        p.scard(k.langLawyers(id));
        p.scard(k.langClients(id));
      }
      p.hget(k.cnt, key);
    }
    const res = (await p.exec()) ?? [];
    let sent = 0;
    const w = pipeline(redis);
    keys.forEach((key, i) => {
      const lawyers = bandOf(Number(res[3 * i]?.[1] ?? 0), bands);
      const clients = bandOf(Number(res[3 * i + 1]?.[1] ?? 0), bands);
      const shown = `${lawyers}|${clients}`;
      if (res[3 * i + 2]?.[1] === shown) return;
      w.hset(k.cnt, key, shown);
      this.realtime.toRoom(hotlineCounterRoom(key), 'hotline:counters', {
        key,
        lawyers,
        clients,
      });
      sent += 1;
    });
    if (sent) await w.exec();
    return sent;
  }
}
