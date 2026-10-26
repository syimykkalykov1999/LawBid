/* eslint-disable @typescript-eslint/require-await -- hand-made Redis / socket fakes */
import type Redis from 'ioredis';
import { RealtimeStatsService } from './realtime-stats.service';

/** A tiny Redis: HINCRBY into hashes, HGETALL back out. */
function fakeRedis() {
  const hashes = new Map<string, Record<string, string>>();
  const redis = {
    pipeline: () => {
      const q: (() => unknown)[] = [];
      const p = {
        hincrby: (k: string, f: string, n: number) => {
          q.push(() => {
            const h = hashes.get(k) ?? {};
            h[f] = String(Number(h[f] ?? 0) + n);
            hashes.set(k, h);
          });
          return p;
        },
        expire: () => p,
        hgetall: (k: string) => {
          q.push(() => hashes.get(k) ?? {});
          return p;
        },
        exec: async () => q.map((f) => [null, f()]),
      };
      return p;
    },
  };
  return redis as unknown as Redis;
}

describe('RealtimeStatsService (owner 2026-10-23)', () => {
  it('counts connects, reconnects, disconnect reasons and lifecycle events over a window', async () => {
    const stats = new RealtimeStatsService(fakeRedis());
    const t = Date.UTC(2026, 9, 23, 12, 0, 30);
    stats.record('connect', t);
    stats.record('connect', t);
    stats.record('reconnect', t);
    stats.record('auth_expiring', t);
    stats.record('auth_refresh', t);
    stats.record('going_away', t + 60_000);
    stats.recordDisconnect('transport close', t);
    stats.recordDisconnect('transport close', t + 60_000);
    stats.recordDisconnect('ping timeout', t);

    const w = await stats.window(5, t + 120_000);
    expect(w).toMatchObject({
      connects: 2,
      reconnects: 1,
      reconnectsPerMin: 0.2,
      authExpiringSent: 1,
      authRefreshed: 1,
      goingAwaySent: 1,
      disconnects: 3,
      disconnectReasons: { 'transport close': 2, 'ping timeout': 1 },
    });
  });

  it('a window that ended long ago is empty', async () => {
    const stats = new RealtimeStatsService(fakeRedis());
    const t = Date.UTC(2026, 9, 23, 12, 0, 0);
    stats.record('connect', t);
    const w = await stats.window(5, t + 3_600_000);
    expect(w.connects).toBe(0);
  });
});
