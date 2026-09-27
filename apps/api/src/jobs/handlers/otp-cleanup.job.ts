import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Key families owned by the OTP flow (src/modules/auth/services/
 * otp.service.ts: otp:code / otp:att / otp:lock) and the auth rate limits
 * that gate it (rate-limit.service.ts: rl:fixed / rl:sliding). Every one of
 * them is written with a TTL — a key WITHOUT one is a leak (an attempts
 * counter or rate window that would never reset and lock the identifier
 * out for good). OTP state lives only in Redis (docs/01 §10.6), so there
 * is no SQL side to clean.
 */
export const OTP_KEY_PATTERNS: readonly string[] = ['otp:*', 'rl:*'];

export const OTP_SCAN_COUNT = 1000;

// Check-and-delete in one atomic step: a key that got a TTL (or was
// recreated with one) between SCAN and here is left alone. PTTL -1 =
// exists without expiry; -2 = already gone.
const UNLINK_IF_PERSISTENT_LUA = `
local n = 0
for _, key in ipairs(KEYS) do
  if redis.call('PTTL', key) == -1 then
    redis.call('UNLINK', key)
    n = n + 1
  end
end
return n
`;

export interface OtpCleanupResult {
  scanned: number;
  deleted: number;
}

/**
 * docs/02_DATABASE.md §6.4 "Токены/сессии/OTP": daily sweep of OTP-related
 * Redis keys that have no expiry. Keys with a TTL expire on their own and
 * are never touched, so a live code / lockout / rate window is never cut
 * short. SCAN-based (non-blocking); the TTL check and UNLINK run in one
 * Lua call per SCAN page.
 * Idempotent; concurrent runs just race to delete the same leaked keys.
 */
@Injectable()
export class OtpCleanupJob {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OtpCleanupJob.name);
  }

  async run(): Promise<OtpCleanupResult> {
    let scanned = 0;
    let deleted = 0;
    for (const pattern of OTP_KEY_PATTERNS) {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          OTP_SCAN_COUNT,
        );
        cursor = next;
        if (keys.length === 0) continue;
        scanned += keys.length;
        deleted += Number(
          await this.redis.eval(UNLINK_IF_PERSISTENT_LUA, keys.length, ...keys),
        );
      } while (cursor !== '0');
    }
    this.logger.info({ scanned, deleted }, 'otp cleanup finished');
    return { scanned, deleted };
  }
}
