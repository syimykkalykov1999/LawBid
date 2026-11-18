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
import { randomUUID } from 'node:crypto';
import { HotlineService } from './hotline.service';

/** Socket.IO room of one counter key (`b:<bucket>` or `l:<lang>`). */
export const hotlineCounterRoom = (key: string) => `hotline:c:${key}`;

/** Compare-and-pexpire / compare-and-set-px of the leader lock: only the
 * holder of the token extends or shortens it (a fencing token, audit 17.11
 * #9 — a pass longer than the lease can no longer overlap another's). */
const LEASE_LUA =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end return 0";

/**
 * Owner row 87: the hotline's clock. Every API instance ticks every
 * `hotline.sweep_interval_ms`, but only the one that takes the Valkey lock
 * does the work (SET NX PX), so 1 or 100 instances cost the same — the
 * «Авто» scaling needs nothing else. Nothing runs while the flag is off.
 *   1. offers older than `offer_timeout_sec` → next attorney;
 *   2. attorneys without a heartbeat → off the line;
 *   3. waiting clients without a heartbeat / expired «Сообщите мне» → closed;
 *   4. connected calls nobody confirms (both gone) or over the length limit;
 *   4b. connected calls ↔ their real 1:1 call (plan PR 4), every
 *      `call_sync_sec`;
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
  /** The lock token of the pass in progress; null = the lease was lost. */
  private token: string | null = null;

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
      if (!(await this.hotline.enabled())) {
        // remember that the switch was off (audit 17.11 #2): heartbeats
        // are refused meanwhile, so the first pass after it must not read
        // everybody as lost
        await this.hotline.redis.set(this.hotline.k.offSince, '1', 'NX');
        return false;
      }
      const { s } = await this.hotline.cfg();
      this.intervalMs = s['hotline.sweep_interval_ms'];
      const h = this.hotline;
      const redis = h.redis;
      // The lease covers the whole pass and is renewed while it runs; at
      // the end it is shortened to what is left of this interval, so 1 or
      // 100 instances still make one pass per interval.
      const lease = Math.max(1000, 3 * this.intervalMs);
      const token = randomUUID();
      const lock = await redis.set(h.k.tick, token, 'PX', lease, 'NX');
      if (lock !== 'OK') return false;
      this.token = token;
      const started = Date.now();
      const renew = setInterval(
        () => {
          void this.renew(redis, lease);
        },
        Math.max(50, Math.floor(lease / 3)),
      );
      renew.unref();
      try {
        if ((await redis.del(h.k.offSince)) === 1) {
          await this.resumeAfterOff(redis, h.nowMs());
        }
        await this.sweep(redis, h.nowMs());
      } finally {
        clearInterval(renew);
        const left = Math.max(1, this.intervalMs - 50 - (Date.now() - started));
        await redis.eval(LEASE_LUA, 1, h.k.tick, token, left);
        this.token = null;
      }
      return true;
    } finally {
      this.running = false;
    }
  }

  /** Extends the lease while this instance still holds it; else the rest
   * of the pass stops at the next step (`holds()`). */
  async renew(redis: Redis, lease: number): Promise<boolean> {
    const token = this.token;
    if (!token) return false;
    const ok = Number(
      await redis.eval(LEASE_LUA, 1, this.hotline.k.tick, token, lease),
    );
    if (ok !== 1) this.token = null;
    return ok === 1;
  }

  /** The switch is back on (audit 17.11 #2, P2: a 30 s call billed as
   * 3630 s). First the connected calls are synced with their real 1:1 call
   * (one hung up meanwhile ends with ITS seconds), then everybody whose
   * heartbeat ran out while heartbeats were refused gets one presence
   * window to beat again; a call that stays silent ends at its last beat. */
  async resumeAfterOff(redis: Redis, now: number): Promise<void> {
    const h = this.hotline;
    const k = h.k;
    const { s } = await h.cfg();
    const batch = s['hotline.sweep_batch'];
    const ttlMs = s['hotline.presence_ttl_sec'] * 1000;
    for (;;) {
      const page = await redis.zrangebyscore(
        k.callsync,
        '-inf',
        '+inf',
        'LIMIT',
        0,
        batch,
      );
      // heartbeats were refused while off: the calls' own seconds count
      await h.syncCalls(page, true);
      // syncCalls re-schedules the live ones into the future
      const left = await redis.zcount(k.callsync, '-inf', now);
      if (page.length < batch || left === 0) break;
    }
    for (const key of [k.conn, k.alive, k.calive]) {
      for (;;) {
        const stale = await redis.zrangebyscore(
          key,
          '-inf',
          now,
          'LIMIT',
          0,
          batch,
        );
        if (stale.length === 0) break;
        const p = pipeline(redis);
        for (const m of stale) p.zadd(key, 'XX', now + ttlMs, m);
        await p.exec();
        if (stale.length < batch) break;
      }
    }
  }

  /** Inside `tick()`: still the leader? (The tests call `sweep` directly.) */
  private holds(): boolean {
    return !this.running || this.token !== null;
  }

  /** Verify 17.11 H1: one broken item (an expired request hash, a lost
   * row) is logged and skipped — it never stops the rest of the tick, or
   * every later tick (it stays due, so it would fail first forever). */
  private async guard(
    step: string,
    item: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : err, step, item },
        'hotline sweep item failed',
      );
    }
  }

  /** The work of one tick (public for the tests, which pass their clock). */
  async sweep(redis: Redis, now: number): Promise<void> {
    const h = this.hotline;
    const k = h.k;
    const { s, raw } = await h.cfg();
    const batch = s['hotline.sweep_batch'];
    const due = (key: string) =>
      redis.zrangebyscore(key, '-inf', now, 'LIMIT', 0, batch);

    for (const m of await due(k.dl)) {
      await this.guard('offer_timeout', m, async () => {
        const req = m.slice(2);
        const st = await h.store.requestState(req);
        if (st?.startsWith('o|')) await h.offerTimedOut(req, st.slice(2));
        else await redis.zrem(k.dl, m);
      });
    }
    for (const lw of await due(k.alive)) {
      await this.guard('lawyer_lost', lw, () => h.goOffline(lw, 'lost'));
    }
    for (const req of await due(k.calive)) {
      await this.guard('client_lost', req, async () => {
        const offline = await h.store.isOffline(req);
        await h.closeRequest(req, offline ? 'notify_expired' : 'lost');
        await redis.zrem(k.calive, req);
      });
    }
    if (!this.holds()) return;
    const lostCalls = await due(k.conn);
    // the real 1:1 call may still be up (its screens beat) or already over
    // with its own seconds: ask it before calling the hotline call lost
    if (lostCalls.length) {
      await this.guard('sync_lost', lostCalls.join(','), () =>
        h.syncCalls(lostCalls),
      );
    }
    for (const req of lostCalls) {
      await this.guard('call_lost', req, async () => {
        const until = await redis.zscore(k.conn, req);
        if (until !== null && Number(until) > now) return;
        await h.endCall(req, 'lost');
        await redis.zrem(k.conn, req);
      });
    }
    for (const req of await due(`${k.p}:connmax`)) {
      await this.guard('call_time_limit', req, async () => {
        await h.endCall(req, 'time_limit');
        await redis.zrem(`${k.p}:connmax`, req);
      });
    }
    // the real 1:1 calls behind connected requests (hung up on the call
    // screen, closed by the calls sweep, voice never came up)
    const toSync = await due(k.callsync);
    await this.guard('sync_calls', toSync.join(','), () => h.syncCalls(toSync));
    // Audit 17.11 #8: `hotline.queue_max_wait_sec` — an online waiter (not
    // «Сообщите мне») waits no longer than this, then «queue_timeout».
    const maxWait = s['hotline.queue_max_wait_sec'];
    if (maxWait > 0) {
      for (const req of await redis.zrangebyscore(
        k.qwait,
        '-inf',
        now - maxWait * 1000,
        'LIMIT',
        0,
        batch,
      )) {
        await this.guard('queue_timeout', req, async () => {
          const st = await h.store.requestState(req);
          if (st?.startsWith('o|')) return; // being offered: after it
          if ((st === 's' || st === 'q') && !(await h.store.isOffline(req))) {
            await h.closeRequest(req, 'queue_timeout');
          }
          await redis.zrem(k.qwait, req);
        });
      }
    }
    if (!this.holds()) return;
    for (const lw of await due(k.pause)) {
      await this.guard('unpause', lw, () => h.unpause(lw));
    }
    for (const req of await due(k.ntf)) {
      await this.guard('notify_due', req, async () => {
        await redis.zrem(k.ntf, req);
        const sent = Number((await redis.hget(k.natt, req)) ?? 0);
        if (sent >= s['hotline.notify_max_attempts']) {
          // «Мы не дозвонились, оставьте заявку снова»
          await h.closeRequest(req, 'notify_exhausted');
        }
      });
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
        await this.guard('after_reserve', req, () =>
          h.afterReserve(req, lw, 0),
        );
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
        await this.guard('notify', req, () =>
          h.notify(req, s['hotline.notify_claim_sec']),
        );
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
    // TTLs on everything (audit 17.11 #12): the last shown value of a
    // counter nobody watches any more is dropped with its watch
    const gone = await redis.zrangebyscore(k.watch, '-inf', now);
    if (gone.length) {
      await redis.zremrangebyscore(k.watch, '-inf', now);
      await redis.hdel(k.cnt, ...gone);
    }
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
