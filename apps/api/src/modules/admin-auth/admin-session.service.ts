import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** docs/06 §2.1: "Сессия 8 часов, простой 30 минут". */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 3600;
export const ADMIN_IDLE_SECONDS = 30 * 60;

const sessKey = (jti: string) => `adm:sess:${jti}`;
const userKey = (userId: string) => `adm:sess:user:${userId}`;
const metaKey = (jti: string) => `adm:sess:meta:${jti}`;

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
 * Admin sessions live in Redis, keyed by the admin JWT's `jti`: the key's
 * TTL is the idle timeout, refreshed on every authorized request; the
 * absolute 8 h limit is the JWT `exp`. A missing key = idle-expired or
 * revoked (logout, admin disabled, 2FA reset) — the guard rejects the
 * token even though its signature is still valid.
 */
@Injectable()
export class AdminSessionService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async create(
    userId: string,
    jti: string,
    meta: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.redis
      .multi()
      .set(sessKey(jti), userId, 'EX', ADMIN_IDLE_SECONDS)
      .sadd(userKey(userId), jti)
      .expire(userKey(userId), ADMIN_SESSION_TTL_SECONDS)
      .hset(metaKey(jti), {
        userId,
        ip: meta.ip ?? '',
        device: describeDevice(meta.userAgent) ?? '',
        createdAt: now,
        lastSeenAt: now,
        lastAction: '',
      })
      .expire(metaKey(jti), ADMIN_SESSION_TTL_SECONDS)
      .exec();
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

  /** Live sessions of these admins (stale entries are dropped on the way). */
  async listForUsers(userIds: string[]): Promise<AdminSessionInfo[]> {
    const out: AdminSessionInfo[] = [];
    for (const userId of userIds) {
      const jtis = await this.redis.smembers(userKey(userId));
      for (const jti of jtis) {
        const [alive, meta] = await Promise.all([
          this.redis.exists(sessKey(jti)),
          this.redis.hgetall(metaKey(jti)),
        ]);
        if (!alive) {
          await this.redis.srem(userKey(userId), jti);
          continue;
        }
        out.push({
          sessionId: jti,
          userId,
          ip: meta.ip || null,
          device: meta.device || null,
          createdAt: meta.createdAt ?? new Date(0).toISOString(),
          lastSeenAt:
            meta.lastSeenAt ?? meta.createdAt ?? new Date(0).toISOString(),
          lastAction: meta.lastAction || null,
        });
      }
    }
    return out;
  }

  /** The admin who owns a live session, or null. */
  async ownerOf(jti: string): Promise<string | null> {
    return this.redis.get(sessKey(jti));
  }

  /** Returns the session's user id and extends the idle window, or null. */
  async touch(jti: string): Promise<string | null> {
    const userId = await this.redis.getex(
      sessKey(jti),
      'EX',
      ADMIN_IDLE_SECONDS,
    );
    return userId ?? null;
  }

  async revoke(jti: string, userId: string): Promise<void> {
    await this.redis
      .multi()
      .del(sessKey(jti), metaKey(jti), `adm:stepup:${jti}`)
      .srem(userKey(userId), jti)
      .exec();
  }

  /** Every session of the admin (disable, role change, 2FA reset). */
  async revokeAllForUser(userId: string): Promise<number> {
    const jtis = await this.redis.smembers(userKey(userId));
    if (jtis.length === 0) return 0;
    await this.redis.del(
      ...jtis.flatMap((j) => [sessKey(j), metaKey(j)]),
      userKey(userId),
    );
    return jtis.length;
  }
}
