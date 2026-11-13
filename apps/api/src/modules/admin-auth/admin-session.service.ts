import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AdminSession } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ck } from '../../redis/redis-cluster-safe';
import { isRedisInfraError } from '../../redis/redis-errors';
import { throttledWarn } from '../../common/logging/throttled-warn';
import {
  ADMIN_ACTIVE_KEY,
  ADMIN_ACTIVE_TTL_SEC,
} from '../../common/ops/admin-activity';

/** docs/06 §2.1: "Сессия 8 часов, простой 30 минут". */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 3600;
export const ADMIN_IDLE_SECONDS = 30 * 60;
/** How often a live session's `last_seen_at` reaches Postgres (row 72). */
export const ADMIN_SEEN_WRITE_MS = 60_000;

const sessKey = (jti: string) => ck('adm', `adm:sess:${jti}`);
const userKey = (userId: string) => ck('adm', `adm:sess:user:${userId}`);
const metaKey = (jti: string) => ck('adm', `adm:sess:meta:${jti}`);

/** What the super admin sees for each live session. */
export interface AdminSessionInfo {
  sessionId: string;
  userId: string;
  ip: string | null;
  device: string | null;
  createdAt: string;
  lastSeenAt: string;
  lastAction: string | null;
}

/** A short, readable device name from a User-Agent (no fingerprinting). */
export function describeDevice(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  return `${browser} · ${os}`;
}

/**
 * Staff package T11: the device pin of a session — a short hash of the
 * User-Agent taken at sign-in. Not a tracking fingerprint (nothing leaves
 * the server, nothing is stored beyond the session's life): it only says
 * "this token is now used from another browser".
 */
export function deviceFingerprint(ua: string | null | undefined): string {
  if (!ua) return '';
  return createHash('sha256').update(ua).digest('hex').slice(0, 16);
}

/** Milliseconds of the idle window left after [lastSeen] (<= 0: ended). */
function idleLeftMs(lastSeen: Date, now: number): number {
  return lastSeen.getTime() + ADMIN_IDLE_SECONDS * 1000 - now;
}

/**
 * Admin sessions, keyed by the admin JWT's `jti`. The idle timeout is the
 * Redis key's TTL, refreshed on every authorized request; the absolute 8 h
 * limit is the JWT `exp`. A missing session = idle-expired or revoked
 * (logout, admin disabled, 2FA reset) — the guard rejects the token even
 * though its signature is still valid.
 *
 * Row 72 (failover test 2026-11-13): the sessions lived ONLY in Redis, so a
 * Redis restart without data (the load stand) or a replaced ElastiCache
 * node (prod runs one node without a replica or snapshots) signed every
 * admin out. Now the `admin_sessions` row is the source of truth and Redis
 * the hot copy — the split the user sessions already use (`sessions` table
 * + `authbl:*` cache) and Django's cached_db session backend: writes go to
 * Postgres first; a Redis miss or outage reads the row, and a live row is
 * put back into Redis. `last_seen_at` is written at most once a minute per
 * session, so after a loss the idle window can only end up to a minute
 * EARLIER, never later. Revocations write the row first, so a revoked
 * session never comes back from Postgres.
 */
@Injectable()
export class AdminSessionService {
  private readonly logger = new Logger(AdminSessionService.name);
  private readonly warnRedis = throttledWarn(this.logger);
  /** jti -> when this process last wrote `last_seen_at` (bounded). */
  private readonly seenWrites = new Map<string, number>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  async create(
    userId: string,
    jti: string,
    meta: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<void> {
    const at = new Date();
    const now = at.toISOString();
    const device = describeDevice(meta.userAgent) ?? '';
    const fp = deviceFingerprint(meta.userAgent);
    // This admin's ended sessions are of no use any more (keeps the table
    // small without a sweeper job).
    await this.prisma.adminSession.deleteMany({
      where: { user_id: userId, expires_at: { lt: at } },
    });
    await this.prisma.adminSession.create({
      data: {
        jti,
        user_id: userId,
        ip: meta.ip ? meta.ip.slice(0, 64) : null,
        device: device ? device.slice(0, 80) : null,
        fp: fp || null,
        created_at: at,
        last_seen_at: at,
        expires_at: new Date(at.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000),
      },
    });
    this.seenWrites.set(jti, at.getTime());
    try {
      await this.redis
        .multi()
        .set(sessKey(jti), userId, 'EX', ADMIN_IDLE_SECONDS)
        .sadd(userKey(userId), jti)
        .expire(userKey(userId), ADMIN_SESSION_TTL_SECONDS)
        .hset(metaKey(jti), {
          userId,
          ip: meta.ip ?? '',
          device,
          fp,
          createdAt: now,
          lastSeenAt: now,
          lastAction: '',
        })
        .expire(metaKey(jti), ADMIN_SESSION_TTL_SECONDS)
        .exec();
    } catch (error) {
      // The row is the session; the first request puts it into Redis.
      if (!isRedisInfraError(error)) throw error;
      this.noteRedisDown(error);
    }
  }

  /** Remembers the last request of a session; never throws. */
  async noteActivity(jti: string, action: string): Promise<void> {
    try {
      await this.redis.eval(
        "if redis.call('exists', KEYS[1]) == 1 then redis.call('hset', KEYS[1], 'lastSeenAt', ARGV[1], 'lastAction', ARGV[2]) end return 1",
        1,
        metaKey(jti),
        new Date().toISOString(),
        action.slice(0, 160),
      );
    } catch {
      // The overview is a nicety; a Redis hiccup must not fail a request.
    }
  }

  /** Where and on what the session was opened (staff package T11). */
  async binding(jti: string): Promise<{ ip: string; fp: string }> {
    const [ip, fp] = await this.redis.hmget(metaKey(jti), 'ip', 'fp');
    return { ip: ip ?? '', fp: fp ?? '' };
  }

  /**
   * Live sessions of these admins (stale Redis entries are dropped on the
   * way). Postgres rows and the Redis set together: sessions opened before
   * the table existed live only in Redis until they end (at most 8 h).
   */
  async listForUsers(userIds: string[]): Promise<AdminSessionInfo[]> {
    const out: AdminSessionInfo[] = [];
    if (userIds.length === 0) return out;
    const now = Date.now();
    const rows = await this.prisma.adminSession.findMany({
      where: {
        user_id: { in: userIds },
        revoked_at: null,
        expires_at: { gt: new Date(now) },
      },
      orderBy: { created_at: 'asc' },
    });
    let redisUp = true;
    for (const userId of userIds) {
      const jtis = new Map<string, AdminSession | null>();
      for (const r of rows) if (r.user_id === userId) jtis.set(r.jti, r);
      if (redisUp) {
        try {
          for (const j of await this.redis.smembers(userKey(userId))) {
            if (!jtis.has(j)) jtis.set(j, null);
          }
        } catch (error) {
          if (!isRedisInfraError(error)) throw error;
          redisUp = false;
        }
      }
      for (const [jti, row] of jtis) {
        let alive = false;
        let meta: Record<string, string> = {};
        if (redisUp) {
          try {
            const [exists, m] = await Promise.all([
              this.redis.exists(sessKey(jti)),
              this.redis.hgetall(metaKey(jti)),
            ]);
            alive = exists === 1;
            meta = m;
          } catch (error) {
            if (!isRedisInfraError(error)) throw error;
            redisUp = false;
          }
        }
        if (!alive && row) alive = idleLeftMs(row.last_seen_at, now) > 0;
        if (!alive) {
          if (redisUp && !row) {
            await this.redis.srem(userKey(userId), jti).catch(() => 0);
          }
          continue;
        }
        const createdAt =
          meta.createdAt ??
          row?.created_at.toISOString() ??
          new Date(0).toISOString();
        out.push({
          sessionId: jti,
          userId,
          ip: meta.ip || row?.ip || null,
          device: meta.device || row?.device || null,
          createdAt,
          lastSeenAt:
            meta.lastSeenAt ?? row?.last_seen_at.toISOString() ?? createdAt,
          lastAction: meta.lastAction || null,
        });
      }
    }
    return out;
  }

  /** The admin who owns a live session, or null. Does not extend the idle
   * window (background polls, sockets). */
  async ownerOf(jti: string): Promise<string | null> {
    let userId: string | null;
    try {
      userId = await this.redis.get(sessKey(jti));
    } catch (error) {
      if (!isRedisInfraError(error)) throw error;
      this.noteRedisDown(error);
      return this.fromDatabase(jti, { extend: false, restore: false });
    }
    if (userId) return userId;
    return this.fromDatabase(jti, { extend: false, restore: true });
  }

  /** Returns the session's user id and extends the idle window, or null. */
  async touch(jti: string): Promise<string | null> {
    let userId: string | null;
    try {
      userId = await this.redis.getex(sessKey(jti), 'EX', ADMIN_IDLE_SECONDS);
    } catch (error) {
      if (!isRedisInfraError(error)) throw error;
      this.noteRedisDown(error);
      userId = await this.fromDatabase(jti, { extend: true, restore: false });
      if (userId) this.markAdminActive();
      return userId;
    }
    if (userId) {
      this.markAdminActive();
      this.noteSeen(jti);
      return userId;
    }
    userId = await this.fromDatabase(jti, { extend: true, restore: true });
    if (userId) this.markAdminActive();
    return userId;
  }

  /**
   * The Postgres verdict for a session Redis does not have (lost data) or
   * cannot be asked about (outage): alive while not revoked, before the
   * absolute end and inside the idle window of `last_seen_at`. [restore]
   * puts a live one back into Redis (with the idle time it has left when
   * the request does not [extend] it).
   */
  private async fromDatabase(
    jti: string,
    opts: { extend: boolean; restore: boolean },
  ): Promise<string | null> {
    const now = Date.now();
    const row = await this.prisma.adminSession.findUnique({ where: { jti } });
    if (!row || row.revoked_at || row.expires_at.getTime() <= now) return null;
    const left = idleLeftMs(row.last_seen_at, now);
    if (left <= 0) return null;
    const lastWrite = this.seenWrites.get(jti);
    if (
      opts.extend &&
      (lastWrite === undefined || now - lastWrite >= ADMIN_SEEN_WRITE_MS)
    ) {
      this.seenWrites.set(jti, now);
      await this.prisma.adminSession.updateMany({
        where: { jti, revoked_at: null },
        data: { last_seen_at: new Date(now) },
      });
    }
    if (opts.restore) {
      const ttl = opts.extend ? ADMIN_IDLE_SECONDS : Math.ceil(left / 1000);
      const absLeft = Math.max(
        1,
        Math.ceil((row.expires_at.getTime() - now) / 1000),
      );
      const seen = new Date(opts.extend ? now : row.last_seen_at.getTime());
      const key = metaKey(jti);
      try {
        // HSETNX: what is still in Redis (the last action, a device pin a
        // test or a newer request wrote) wins over the row.
        await this.redis
          .multi()
          .set(sessKey(jti), row.user_id, 'EX', ttl)
          .sadd(userKey(row.user_id), jti)
          .expire(userKey(row.user_id), ADMIN_SESSION_TTL_SECONDS)
          .hsetnx(key, 'userId', row.user_id)
          .hsetnx(key, 'ip', row.ip ?? '')
          .hsetnx(key, 'device', row.device ?? '')
          .hsetnx(key, 'fp', row.fp ?? '')
          .hsetnx(key, 'createdAt', row.created_at.toISOString())
          .hsetnx(key, 'lastSeenAt', seen.toISOString())
          .hsetnx(key, 'lastAction', '')
          .expire(key, absLeft)
          .exec();
      } catch {
        // The next request reads the row again.
      }
    }
    return row.user_id;
  }

  /**
   * At most once a minute per session: `last_seen_at` to Postgres, so a
   * lost Redis keeps the idle window. Also the backstop for a revocation
   * whose Redis delete failed (Redis away at that moment): the row says
   * revoked, the Redis copy goes. Never awaited, never throws.
   */
  private noteSeen(jti: string): void {
    const now = Date.now();
    const last = this.seenWrites.get(jti);
    if (last !== undefined && now - last < ADMIN_SEEN_WRITE_MS) return;
    if (this.seenWrites.size >= 10_000) this.seenWrites.clear();
    this.seenWrites.set(jti, now);
    void (async () => {
      const row = await this.prisma.adminSession.findUnique({
        where: { jti },
        select: { revoked_at: true },
      });
      if (!row) return; // opened before the table existed
      if (row.revoked_at) {
        await this.redis.del(sessKey(jti), metaKey(jti));
        return;
      }
      await this.prisma.adminSession.updateMany({
        where: { jti, revoked_at: null },
        data: { last_seen_at: new Date(now) },
      });
    })().catch(() => undefined);
  }

  private noteRedisDown(error: unknown): void {
    this.warnRedis(
      { err: error, alert: 'admin_session_redis_down' },
      'Admin session: Redis unavailable, the database answers',
    );
  }

  /** S20-1: "an admin is looking now" for 10 minutes; the heavy admin
   * aggregates follow it in Авто. Never throws, never awaited. */
  private markAdminActive(): void {
    try {
      void Promise.resolve(
        this.redis.set(ADMIN_ACTIVE_KEY, '1', 'EX', ADMIN_ACTIVE_TTL_SEC),
      ).catch(() => undefined);
    } catch {
      // a signal only
    }
  }

  async revoke(jti: string, userId: string): Promise<void> {
    // Postgres first: a revoked row never comes back into Redis.
    await this.prisma.adminSession.updateMany({
      where: { jti, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    this.seenWrites.delete(jti);
    await this.redis
      .multi()
      .del(sessKey(jti), metaKey(jti), ck('adm', `adm:stepup:${jti}`))
      .srem(userKey(userId), jti)
      .exec();
  }

  /** Every session of the admin (disable, role change, 2FA reset). */
  async revokeAllForUser(userId: string): Promise<number> {
    const where = {
      user_id: userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
    };
    const live = await this.prisma.adminSession.findMany({
      where,
      select: { jti: true },
    });
    if (live.length > 0) {
      await this.prisma.adminSession.updateMany({
        where: { ...where, jti: { in: live.map((r) => r.jti) } },
        data: { revoked_at: new Date() },
      });
    }
    const jtis = new Set(live.map((r) => r.jti));
    for (const j of await this.redis.smembers(userKey(userId))) jtis.add(j);
    if (jtis.size === 0) return 0;
    await this.redis.del(
      ...[...jtis].flatMap((j) => [sessKey(j), metaKey(j)]),
      userKey(userId),
    );
    return jtis.size;
  }
}
