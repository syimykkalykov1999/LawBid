import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { RateLimitService } from './rate-limit.service';
import { SessionService } from './session.service';

/** Wrong passwords from one source (account + IP) that cost no wait. */
export const LOGIN_BACKOFF_FREE_FAILURES = 5;
/** The first wait after the free ones; each further failure doubles it. */
export const LOGIN_BACKOFF_BASE_SECONDS = 2;
export const LOGIN_BACKOFF_MAX_SECONDS = 15 * 60;
/** How long a source's failures are remembered after the last one. */
export const LOGIN_BACKOFF_MEMORY_SECONDS = 24 * 3600;

/** Wrong passwords for one account from everywhere. The hourly window is
 * the one PasswordAuthService already counts (`pwd-login-fail`, 60/h);
 * the daily one stops a slow guessing storm spread over many addresses. */
export const LOGIN_FAILURES_PER_ACCOUNT_HOUR = 60;
export const LOGIN_FAILURES_PER_ACCOUNT_DAY = 200;
const HOUR = 3600;
const DAY = 24 * 3600;

// One source's failure: count it and set when the next try may come.
// KEYS[1] hash {n, until}; ARGV now(ms), free, base(s), max(s), memory(s).
const BACKOFF_FAIL_LUA = `
local n = redis.call('HINCRBY', KEYS[1], 'n', 1)
local free = tonumber(ARGV[2])
local delay = 0
if n > free then
  delay = math.min(tonumber(ARGV[3]) * (2 ^ (n - free - 1)), tonumber(ARGV[4]))
end
redis.call('HSET', KEYS[1], 'until', tonumber(ARGV[1]) + delay * 1000)
redis.call('EXPIRE', KEYS[1], ARGV[5])
return delay
`;

/**
 * Security audit 2026-11-08 (M1). Password sign-in throttling checked
 * BEFORE the password hash, the way OWASP's Authentication and Credential
 * Stuffing cheat sheets describe it (exponential delay, account lockout
 * with a time window, and "lock out untrusted clients only" from
 * "Slow Down Online Guessing Attacks with Device Cookies"):
 *
 * 1. per account + source: the first 5 wrong passwords are free, then
 *    every next try waits 2 s, 4 s, 8 s … up to 15 min; a correct password
 *    from that source clears it. Someone else's guesses from another
 *    address never slow the owner down.
 * 2. per account from everywhere: 60 wrong passwords in an hour or 200 in
 *    a day close sign-in for devices this account never signed in on. A
 *    device with an earlier session on the account (sessions.device_id)
 *    still signs in, so a guessing storm cannot lock the owner out; a new
 *    device has «Забыл пароль».
 *
 * Every refusal is the same generic 429 RATE_LIMITED, for a known and an
 * unknown account alike, and costs no scrypt.
 */
@Injectable()
export class PasswordLoginThrottle {
  private readonly log = new Logger(PasswordLoginThrottle.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly rateLimit: RateLimitService,
    private readonly sessions: SessionService,
  ) {}

  /** Throws 429 when this try must not reach the password check. */
  async assertMayTry(input: {
    idHash: string;
    source: string;
    userId: string | undefined;
    deviceId: string | undefined;
  }): Promise<void> {
    const wait = await this.waitSeconds(input.idHash, input.source);
    if (wait > 0) throw tooMany(wait);
    const [hour, day] = await Promise.all([
      this.rateLimit.peekSlidingWindow(
        ['pwd-login-fail', 'id', input.idHash],
        HOUR,
      ),
      this.rateLimit.peekSlidingWindow(
        ['pwd-login-fail', 'id-day', input.idHash],
        DAY,
      ),
    ]);
    const capped =
      hour.count >= LOGIN_FAILURES_PER_ACCOUNT_HOUR
        ? hour.retryAfterSeconds
        : day.count >= LOGIN_FAILURES_PER_ACCOUNT_DAY
          ? day.retryAfterSeconds
          : 0;
    if (capped === 0) return;
    if (
      input.userId &&
      (await this.knownDevice(input.userId, input.deviceId))
    ) {
      return;
    }
    throw tooMany(capped);
  }

  /** A wrong password (or an unknown account). Never throws. */
  async recordFailure(idHash: string, source: string): Promise<void> {
    try {
      await this.redis.eval(
        BACKOFF_FAIL_LUA,
        1,
        backoffKey(idHash, source),
        Date.now(),
        LOGIN_BACKOFF_FREE_FAILURES,
        LOGIN_BACKOFF_BASE_SECONDS,
        LOGIN_BACKOFF_MAX_SECONDS,
        LOGIN_BACKOFF_MEMORY_SECONDS,
      );
      await this.rateLimit.consumeSlidingWindow(
        ['pwd-login-fail', 'id-day', idHash],
        LOGIN_FAILURES_PER_ACCOUNT_DAY,
        DAY,
      );
    } catch (err) {
      this.log.warn({ err }, 'password failure not counted');
    }
  }

  /** The right password from this source: its delay starts over. */
  async recordSuccess(idHash: string, source: string): Promise<void> {
    try {
      await this.redis.del(backoffKey(idHash, source));
    } catch {
      // best effort
    }
  }

  private async waitSeconds(idHash: string, source: string): Promise<number> {
    const until = Number(
      await this.redis.hget(backoffKey(idHash, source), 'until'),
    );
    if (!Number.isFinite(until)) return 0;
    const left = until - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  private async knownDevice(
    userId: string,
    deviceId: string | undefined,
  ): Promise<boolean> {
    if (!deviceId) return false;
    return !(await this.sessions.isNewDevice(userId, deviceId));
  }
}

function backoffKey(idHash: string, source: string): string {
  return `auth:pwd-backoff:${idHash}:${source}`;
}

function tooMany(retryAfterSeconds: number): HttpException {
  return new HttpException(
    {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many attempts. Try again later.',
      details: { retryAfterSeconds },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
