import Redis from 'ioredis';
import type { AppSettingsService } from '../common/app-settings/app-settings.service';
import { CloudflareTransport } from '../modules/calls/cloudflare-transport';
import { ContactsSyncService } from '../modules/contacts-sync/contacts-sync.service';
import { FilesService } from '../modules/files/files.service';
import { HotlineService } from '../modules/hotline/hotline.service';
import { HotlineKeys } from '../modules/hotline/hotline.store';
import { BadgesService } from '../modules/notifications/badges.service';
import { StaffCountersService } from '../modules/staff-rating/staff-counters.service';
import { BarAttemptsService } from '../modules/verification/services/bar-attempts.service';

const URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Verify batch 13 (R2–R6, N1, R1 bumpAgg), on a real Valkey (skipped
 * without one). Each write below used to be "counter, then its TTL" as two
 * calls; the process dying (deploy, Spot stop, OOM) or Redis failing over
 * between them left the key with NO TTL for ever. The crash is simulated by
 * a client whose stand-alone EXPIRE / PEXPIRE fails (a MULTI is one round
 * trip, so it still goes through): after the write every key must have a
 * TTL (or not exist).
 */
describe('Redis keys keep their TTL when the process dies between two calls (real Valkey)', () => {
  let redis: Redis;
  let up = false;
  const tag = `b13ttl${process.pid}`;

  /** The real client, except a lone EXPIRE / PEXPIRE "never arrives". */
  const crashing = (): Redis =>
    new Proxy(redis, {
      get(target, name, receiver) {
        if (name === 'expire' || name === 'pexpire') {
          return () => Promise.reject(new Error('process died here'));
        }
        const v: unknown = Reflect.get(target, name, receiver);
        return typeof v === 'function'
          ? (v as (...a: unknown[]) => unknown).bind(target)
          : v;
      },
    });

  const settings = (n: Record<string, number | string>) =>
    ({
      number: (k: string) => Promise.resolve(Number(n[k] ?? 0)),
      string: (k: string) => Promise.resolve(String(n[k] ?? '')),
    }) as unknown as AppSettingsService;

  /** -2: gone; -1: there, without a TTL (the bug); > 0: fine. */
  const ttlOf = (key: string) => redis.ttl(key);

  beforeAll(async () => {
    redis = new Redis(URL, {
      db: 14,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
      await redis.connect();
      await redis.ping();
      up = true;
    } catch {
      up = false;
    }
  });

  afterAll(async () => {
    if (up) {
      const keys = [
        ...(await redis.keys(`*${tag}*`)),
        ...(await redis.keys('calls:cf:fail:*')),
      ];
      if (keys.length) await redis.del(...keys);
    }
    redis.disconnect();
  });

  it('R2: the daily upload byte counter', async () => {
    if (!up) return;
    const svc = Object.create(FilesService.prototype) as {
      reserveDailyUpload(userId: string, bytes: number): Promise<void>;
    };
    Object.assign(svc, {
      redis: crashing(),
      settings: settings({ 'storage.daily_upload_mb_per_user': 100 }),
      logger: { error: () => undefined, warn: () => undefined },
    });
    await svc.reserveDailyUpload(`u-${tag}`, 1024);
    const [key] = await redis.keys(`upload:bytes:u-${tag}:*`);
    expect(key).toBeDefined();
    expect(await ttlOf(key)).toBeGreaterThan(0);
  });

  it('R3: the contacts-sync daily distinct set', async () => {
    if (!up) return;
    const svc = Object.create(ContactsSyncService.prototype) as {
      charge(key: string, hashes: string[], limit: number): Promise<void>;
    };
    Object.assign(svc, { redis: crashing() });
    const key = `contacts:day:${tag}`;
    await svc.charge(key, ['a', 'b', 'c'], 1000).catch(() => undefined);
    expect(await ttlOf(key)).toBeGreaterThan(0);
  });

  it('R4: the bar-number fail counters (user and IP)', async () => {
    if (!up) return;
    const svc = new BarAttemptsService(
      crashing(),
      settings({
        'verification.bar_fails_per_step': 5,
        'verification.bar_cooldown_hours': '1',
        'verification.bar_fail_reset_days': 1,
      }),
    );
    await svc.recordFailure(`u-${tag}`, `ip-${tag}`).catch(() => undefined);
    expect(await ttlOf(`bar:fails:u:u-${tag}`)).toBeGreaterThan(0);
    expect(await ttlOf(`bar:fails:ip:ip-${tag}`)).toBeGreaterThan(0);
  });

  it('R5: a late staff report creates the day counters with a TTL', async () => {
    if (!up) return;
    const svc = new StaffCountersService({} as never, redis);
    const addTime = (
      svc as unknown as {
        addTime(day: string, adminId: string, ms: number): Promise<void>;
      }
    ).addTime.bind(svc);
    await addTime('2026-11-18', `a-${tag}`, 1500);
    expect(await ttlOf(`staff:ctr:2026-11-18:a-${tag}`)).toBeGreaterThan(0);
  });

  it('R6: the badge hash expiring between EXISTS and HSET is not re-created without a TTL', async () => {
    if (!up) return;
    const userId = `u-${tag}`;
    // EXISTS said "there", then the 24 h TTL fired before HSET.
    const racing = new Proxy(redis, {
      get(target, name, receiver) {
        if (name === 'exists') return () => Promise.resolve(1);
        const v: unknown = Reflect.get(target, name, receiver);
        return typeof v === 'function'
          ? (v as (...a: unknown[]) => unknown).bind(target)
          : v;
      },
    });
    const svc = new BadgesService({} as never, racing, {} as never);
    Object.assign(svc, {
      countNotifications: () => Promise.resolve(3),
      countChats: () => Promise.resolve(1),
      publish: () => Promise.resolve(),
    });
    await svc.notificationsChanged(userId);
    await svc.chatsChanged(userId);
    const ttl = await ttlOf(`badge:${userId}`);
    expect(ttl === -2 || ttl > 0).toBe(true);
  });

  it('N1: the Cloudflare breaker failure counter', async () => {
    if (!up) return;
    const cf = new CloudflareTransport(
      crashing(),
      settings({
        'calls.transport_fail_limit': 5,
        'calls.transport_fail_window_sec': 60,
      }),
    );
    await cf.recordFailure('turn', 'test');
    expect(await ttlOf('calls:cf:fail:turn')).toBeGreaterThan(0);
  });

  it('R1: the hotline hour stats hash written by bumpAgg', async () => {
    if (!up) return;
    const svc = Object.create(HotlineService.prototype) as {
      bumpAgg(field: string, by?: number): Promise<void>;
    };
    const k = new HotlineKeys(`hl:{${tag}}`);
    const now = Date.UTC(2026, 10, 18, 9, 30);
    Object.assign(svc, { redis: crashing(), k, now: () => now });
    await svc.bumpAgg('offers').catch(() => undefined);
    expect(await ttlOf(k.agg('2026-11-18T09'))).toBeGreaterThan(0);
  });
});
