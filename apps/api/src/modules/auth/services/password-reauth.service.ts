import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { withDeleted } from '../../../prisma/soft-delete.extension';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import type { RequestUser } from '../decorators/current-user.decorator';
import { AUTH_EVENT_TYPES, AuthEventService } from './auth-event.service';
import { PasswordService } from './password.service';
import { RateLimitService } from './rate-limit.service';
import type { RequestMeta } from './session.service';
import { TokenService } from './token.service';

/** Password tries per account per hour (right or wrong). */
export const REAUTH_PASSWORD_PER_USER = 20;
/** Password tries per IP per hour (many accounts behind one address). */
export const REAUTH_PASSWORD_PER_IP = 60;
/** Wrong passwords in a row that lock the password step-up. */
export const REAUTH_PASSWORD_LOCK_AFTER = 5;
/** How long the lock lasts (the SMS fallback stays open meanwhile). */
export const REAUTH_PASSWORD_LOCK_SECONDS = 15 * 60;
const WINDOW_SECONDS = 3600;

/**
 * Owner 2026-10-28: «Подтвердите, что это вы» asks for the ACCOUNT
 * PASSWORD, not an SMS code (each SMS costs money). `POST /auth/reauth`
 * with `{method: 'password', password}` mints the very same single-use,
 * 5-minute reauth token as the code path (same TokenService call, same
 * scope: this user + this session), so every guarded action is unchanged.
 *
 * Brute force: scrypt + timingSafeEqual (PasswordService.verify, the same
 * constant-time check as sign-in), a per-account and per-IP hourly cap,
 * and a lock after [REAUTH_PASSWORD_LOCK_AFTER] wrong passwords for
 * [REAUTH_PASSWORD_LOCK_SECONDS] — while locked even the right password
 * is refused. Every try is an auth event (reauth_success / reauth_failed).
 *
 * An account without a password, or an attorney who must use a passkey
 * (`security.attorney_strong_auth`), gets REAUTH_INVALID with
 * `details.reason`, and the app switches to the code (SMS) path.
 */
@Injectable()
export class PasswordReauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rateLimit: RateLimitService,
    private readonly tokens: TokenService,
    private readonly authEvents: AuthEventService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  async reauth(
    password: string,
    user: RequestUser,
    meta?: RequestMeta,
  ): Promise<{ reauthToken: string }> {
    await this.limit(
      ['reauth-pwd', 'user', user.sub],
      REAUTH_PASSWORD_PER_USER,
      'rate',
    );
    if (meta?.ip) {
      await this.limit(
        ['reauth-pwd', 'ip', meta.ip],
        REAUTH_PASSWORD_PER_IP,
        'rate',
      );
    }
    const lockKey = this.lockKey(user.sub);
    const failures = Number((await this.redis.get(lockKey)) ?? 0);
    if (failures >= REAUTH_PASSWORD_LOCK_AFTER) {
      const ttl = await this.redis.ttl(lockKey);
      await this.fail(user, meta, 'locked');
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many wrong passwords. Try again later.',
          details: {
            retryAfterSeconds: ttl > 0 ? ttl : REAUTH_PASSWORD_LOCK_SECONDS,
            reason: 'locked',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const account = await this.prisma.user.findUniqueOrThrow({
      where: withDeleted({ id: user.sub }),
      select: { id: true, role: true, password_hash: true },
    });
    const passwordHash = account.password_hash;
    if (!passwordHash) {
      await this.fail(user, meta, 'no_password');
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'This account has no password: confirm with a code.',
        details: { reason: 'no_password' },
      });
    }
    if (await this.passkeyRequired(account.id, account.role ?? '')) {
      await this.fail(user, meta, 'passkey_required');
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'Confirm with your passkey or a code.',
        details: { reason: 'passkey_required' },
      });
    }

    const ok = await this.passwords.verify(password, passwordHash);
    if (!ok) {
      const count = await this.redis.incr(lockKey);
      if (count === 1) {
        await this.redis.expire(lockKey, REAUTH_PASSWORD_LOCK_SECONDS);
      }
      await this.fail(user, meta, 'wrong_password');
      throw new UnauthorizedException({
        code: ErrorCode.REAUTH_INVALID,
        message: 'Incorrect password.',
        details: {
          reason: 'wrong_password',
          attemptsLeft: Math.max(0, REAUTH_PASSWORD_LOCK_AFTER - count),
        },
      });
    }

    await this.redis.del(lockKey);
    const reauthToken = this.tokens.signReauthToken({
      sub: user.sub,
      sid: user.sid,
    });
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.REAUTH_SUCCESS,
      success: true,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      meta: { method: 'password' },
    });
    return { reauthToken };
  }

  private lockKey(userId: string): string {
    return `reauth-pwd:fail:${userId}`;
  }

  /** Same rule as the password sign-in (PasswordAuthService). */
  private async passkeyRequired(
    userId: string,
    role: string,
  ): Promise<boolean> {
    if (!this.settings) return false;
    if (role !== 'attorney' && role !== 'assistant') return false;
    if (!(await this.settings.boolean('security.attorney_strong_auth'))) {
      return false;
    }
    const passkeys = await this.prisma.webauthnCredential.count({
      where: { user_id: userId, scope: 'user' },
    });
    return passkeys > 0;
  }

  private async fail(
    user: RequestUser,
    meta: RequestMeta | undefined,
    reason: string,
  ): Promise<void> {
    await this.authEvents.record({
      userId: user.sub,
      eventType: AUTH_EVENT_TYPES.REAUTH_FAILED,
      success: false,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      meta: { method: 'password', reason },
    });
  }

  private async limit(
    key: string[],
    max: number,
    reason: string,
  ): Promise<void> {
    const r = await this.rateLimit.consumeSlidingWindow(
      key,
      max,
      WINDOW_SECONDS,
    );
    if (r.allowed) return;
    throw new HttpException(
      {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many attempts. Try again later.',
        details: { retryAfterSeconds: r.retryAfterSeconds, reason },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
