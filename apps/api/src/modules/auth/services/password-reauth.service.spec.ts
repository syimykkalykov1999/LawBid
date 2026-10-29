import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { RequestUser } from '../decorators/current-user.decorator';
import {
  PasswordReauthService,
  REAUTH_PASSWORD_LOCK_AFTER,
  REAUTH_PASSWORD_PER_USER,
} from './password-reauth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Owner 2026-10-28: «Подтвердите, что это вы» with the account password
 * instead of a paid SMS — same single-use 5-minute reauth token, with a
 * per-account / per-IP cap and a lock after wrong passwords.
 */

const CONFIG: Record<string, unknown> = {
  JWT_KEYS: `kid1:${'a'.repeat(32)}`,
  JWT_ACTIVE_KID: 'kid1',
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_TTL_DAYS: 60,
  REAUTH_TOKEN_TTL_SECONDS: 300,
};
const config = {
  getOrThrow: <T>(key: string): T => {
    if (!(key in CONFIG)) throw new Error(`missing ${key}`);
    return CONFIG[key] as T;
  },
};
const tokens = new TokenService(new JwtService({}), config as never);
const passwords = new PasswordService();
const USER: RequestUser = {
  sub: 'user-1',
  role: 'client',
  sid: 'chain-1',
  verified: false,
  subscriptionStatus: 'none',
};
const META = { ip: '203.0.113.7', userAgent: 'test' };

function fakeRedis() {
  const kv = new Map<string, number>();
  return {
    get: jest.fn((k: string) =>
      Promise.resolve(kv.has(k) ? String(kv.get(k)) : null),
    ),
    incr: jest.fn((k: string) => {
      kv.set(k, (kv.get(k) ?? 0) + 1);
      return Promise.resolve(kv.get(k));
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    ttl: jest.fn(() => Promise.resolve(600)),
    del: jest.fn((k: string) => {
      kv.delete(k);
      return Promise.resolve(1);
    }),
  };
}

function fakeRateLimit() {
  const counts = new Map<string, number>();
  return {
    consumeSlidingWindow: jest.fn((parts: string[], limit: number) => {
      const key = parts.join(':');
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return Promise.resolve({
        allowed: n <= limit,
        remaining: Math.max(0, limit - n),
        retryAfterSeconds: n <= limit ? 0 : 1800,
      });
    }),
  };
}

async function make(opts: {
  password?: string | null;
  role?: string;
  strongAuth?: boolean;
  passkeys?: number;
}) {
  const hash =
    opts.password === null
      ? null
      : await passwords.hash(opts.password ?? 'right-pass-1');
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: USER.sub,
        role: opts.role ?? 'client',
        password_hash: hash,
      }),
    },
    webauthnCredential: {
      count: jest.fn().mockResolvedValue(opts.passkeys ?? 0),
    },
  };
  const authEvents = { record: jest.fn().mockResolvedValue(undefined) };
  const redis = fakeRedis();
  const rateLimit = fakeRateLimit();
  const settings = {
    boolean: jest.fn().mockResolvedValue(opts.strongAuth ?? false),
  };
  const service = new PasswordReauthService(
    prisma as never,
    passwords,
    rateLimit as never,
    tokens,
    authEvents as never,
    redis as never,
    settings as never,
  );
  return { service, authEvents, redis, rateLimit, prisma };
}

const responseOf = (e: unknown) =>
  (e as HttpException).getResponse() as {
    code: string;
    details?: Record<string, unknown>;
  };

async function caught(p: Promise<unknown>): Promise<HttpException> {
  try {
    await p;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected a rejection');
}

describe('PasswordReauthService', () => {
  it('the right password mints the same reauth token for this session', async () => {
    const { service, authEvents } = await make({});
    const { reauthToken } = await service.reauth('right-pass-1', USER, META);
    const claims = tokens.verifyReauthToken(reauthToken);
    expect(claims.sub).toBe(USER.sub);
    expect(claims.sid).toBe(USER.sid);
    expect(authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'reauth_success',
        success: true,
        meta: { method: 'password' },
      }),
    );
  });

  it('a wrong password is REAUTH_INVALID with attempts left, and audited', async () => {
    const { service, authEvents } = await make({});
    const e = await caught(service.reauth('wrong', USER, META));
    expect(e.getStatus()).toBe(401);
    expect(responseOf(e).code).toBe(ErrorCode.REAUTH_INVALID);
    expect(responseOf(e).details).toEqual({
      reason: 'wrong_password',
      attemptsLeft: REAUTH_PASSWORD_LOCK_AFTER - 1,
    });
    expect(authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'reauth_failed',
        success: false,
        meta: { method: 'password', reason: 'wrong_password' },
      }),
    );
  });

  it('locks after N wrong passwords — even the right one is refused', async () => {
    const { service } = await make({});
    for (let i = 0; i < REAUTH_PASSWORD_LOCK_AFTER; i++) {
      await caught(service.reauth('wrong', USER, META));
    }
    const e = await caught(service.reauth('right-pass-1', USER, META));
    expect(e.getStatus()).toBe(429);
    expect(responseOf(e).code).toBe(ErrorCode.RATE_LIMITED);
    expect(responseOf(e).details).toEqual({
      retryAfterSeconds: 600,
      reason: 'locked',
    });
  });

  it('a success clears the wrong-password count', async () => {
    const { service, redis } = await make({});
    await caught(service.reauth('wrong', USER, META));
    await service.reauth('right-pass-1', USER, META);
    expect(redis.del).toHaveBeenCalledWith('reauth-pwd:fail:user-1');
    const e = await caught(service.reauth('wrong', USER, META));
    expect(responseOf(e).details?.attemptsLeft).toBe(
      REAUTH_PASSWORD_LOCK_AFTER - 1,
    );
  });

  it('is rate limited per account (429 before any password check)', async () => {
    const { service, rateLimit } = await make({});
    rateLimit.consumeSlidingWindow.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1800,
    });
    const e = await caught(service.reauth('right-pass-1', USER, META));
    expect(e.getStatus()).toBe(429);
    expect(responseOf(e).details).toEqual({
      retryAfterSeconds: 1800,
      reason: 'rate',
    });
    expect(rateLimit.consumeSlidingWindow).toHaveBeenCalledWith(
      ['reauth-pwd', 'user', USER.sub],
      REAUTH_PASSWORD_PER_USER,
      3600,
    );
  });

  it('also caps tries per IP', async () => {
    const { service, rateLimit } = await make({});
    await service.reauth('right-pass-1', USER, META);
    expect(rateLimit.consumeSlidingWindow).toHaveBeenCalledWith(
      ['reauth-pwd', 'ip', META.ip],
      expect.any(Number),
      3600,
    );
  });

  it('an account without a password is told to use the code (SMS fallback)', async () => {
    const { service } = await make({ password: null });
    const e = await caught(service.reauth('anything', USER, META));
    expect(e.getStatus()).toBe(401);
    expect(responseOf(e).code).toBe(ErrorCode.REAUTH_INVALID);
    expect(responseOf(e).details).toEqual({ reason: 'no_password' });
  });

  it('an attorney with a passkey under strong auth cannot step up with a password', async () => {
    const { service } = await make({
      role: 'attorney',
      strongAuth: true,
      passkeys: 1,
    });
    const e = await caught(service.reauth('right-pass-1', USER, META));
    expect(responseOf(e).details).toEqual({ reason: 'passkey_required' });
  });
});
