import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** docs/06 §2.1: "Сессия 8 часов, простой 30 минут". */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 3600;
export const ADMIN_IDLE_SECONDS = 30 * 60;

const sessKey = (jti: string) => `adm:sess:${jti}`;
const userKey = (userId: string) => `adm:sess:user:${userId}`;

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

  async create(userId: string, jti: string): Promise<void> {
    await this.redis
      .multi()
      .set(sessKey(jti), userId, 'EX', ADMIN_IDLE_SECONDS)
      .sadd(userKey(userId), jti)
      .expire(userKey(userId), ADMIN_SESSION_TTL_SECONDS)
      .exec();
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
      .del(sessKey(jti))
      .srem(userKey(userId), jti)
      .exec();
  }

  /** Every session of the admin (disable, role change, 2FA reset). */
  async revokeAllForUser(userId: string): Promise<number> {
    const jtis = await this.redis.smembers(userKey(userId));
    if (jtis.length === 0) return 0;
    await this.redis.del(...jtis.map(sessKey), userKey(userId));
    return jtis.length;
  }
}
