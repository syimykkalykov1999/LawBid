import { HttpException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  LOGIN_BACKOFF_BASE_SECONDS,
  LOGIN_BACKOFF_FREE_FAILURES,
  LOGIN_BACKOFF_MAX_SECONDS,
  LOGIN_FAILURES_PER_ACCOUNT_DAY,
  LOGIN_FAILURES_PER_ACCOUNT_HOUR,
  PasswordLoginThrottle,
} from './password-login-throttle.service';

function make(
  opts: {
    until?: number | null;
    hour?: number;
    day?: number;
    knownDevice?: boolean;
  } = {},
) {
  const redis = {
    hget: jest
      .fn()
      .mockResolvedValue(opts.until == null ? null : String(opts.until)),
    eval: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
  };
  const rateLimit = {
    peekSlidingWindow: jest.fn((parts: string[]) =>
      Promise.resolve({
        count: parts[1] === 'id' ? (opts.hour ?? 0) : (opts.day ?? 0),
        retryAfterSeconds: 120,
      }),
    ),
    consumeSlidingWindow: jest
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 1 }),
  };
  const sessions = {
    isNewDevice: jest.fn().mockResolvedValue(!opts.knownDevice),
  };
  const throttle = new PasswordLoginThrottle(
    redis as never,
    rateLimit as never,
    sessions as never,
  );
  return { throttle, redis, rateLimit, sessions };
}

const TRY = {
  idHash: 'h1',
  source: '1.2.3.4',
  userId: 'u1',
  deviceId: 'dev-1',
};

async function refusal(p: Promise<unknown>): Promise<HttpException> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(HttpException);
  const e = err as HttpException;
  expect(e.getStatus()).toBe(429);
  expect(e.getResponse()).toMatchObject({ code: ErrorCode.RATE_LIMITED });
  return e;
}

describe('PasswordLoginThrottle (security audit 2026-11-08, M1)', () => {
  it('a source with no failures passes', async () => {
    const { throttle } = make();
    await expect(throttle.assertMayTry(TRY)).resolves.toBeUndefined();
  });

  it('a source inside its wait is refused before anything else is read', async () => {
    const { throttle, rateLimit } = make({ until: Date.now() + 8_000 });
    const e = await refusal(throttle.assertMayTry(TRY));
    expect(
      (e.getResponse() as { details: { retryAfterSeconds: number } }).details
        .retryAfterSeconds,
    ).toBeGreaterThan(0);
    expect(rateLimit.peekSlidingWindow).not.toHaveBeenCalled();
  });

  it('an elapsed wait no longer refuses', async () => {
    const { throttle } = make({ until: Date.now() - 1 });
    await expect(throttle.assertMayTry(TRY)).resolves.toBeUndefined();
  });

  it.each([
    ['hourly', { hour: LOGIN_FAILURES_PER_ACCOUNT_HOUR }],
    ['daily', { day: LOGIN_FAILURES_PER_ACCOUNT_DAY }],
  ])(
    'a %s-capped account refuses a device it never saw, and an unknown account alike',
    async (_n, caps) => {
      await refusal(make(caps).throttle.assertMayTry(TRY));
      await refusal(
        make(caps).throttle.assertMayTry({ ...TRY, deviceId: undefined }),
      );
      await refusal(
        make({ ...caps, knownDevice: true }).throttle.assertMayTry({
          ...TRY,
          userId: undefined,
        }),
      );
    },
  );

  it('a capped account still opens on a device that signed in on it before', async () => {
    const { throttle, sessions } = make({
      hour: LOGIN_FAILURES_PER_ACCOUNT_HOUR,
      knownDevice: true,
    });
    await expect(throttle.assertMayTry(TRY)).resolves.toBeUndefined();
    expect(sessions.isNewDevice).toHaveBeenCalledWith('u1', 'dev-1');
  });

  it('below the caps no device lookup is made', async () => {
    const { throttle, sessions } = make({
      hour: LOGIN_FAILURES_PER_ACCOUNT_HOUR - 1,
      day: LOGIN_FAILURES_PER_ACCOUNT_DAY - 1,
    });
    await throttle.assertMayTry(TRY);
    expect(sessions.isNewDevice).not.toHaveBeenCalled();
  });

  it('a failure feeds the per-source backoff and the daily account window', async () => {
    const { throttle, redis, rateLimit } = make();
    await throttle.recordFailure('h1', '1.2.3.4');
    const args = redis.eval.mock.calls[0] as unknown[];
    expect(args[2]).toBe('auth:pwd-backoff:h1:1.2.3.4');
    expect(args.slice(4, 7)).toEqual([
      LOGIN_BACKOFF_FREE_FAILURES,
      LOGIN_BACKOFF_BASE_SECONDS,
      LOGIN_BACKOFF_MAX_SECONDS,
    ]);
    expect(rateLimit.consumeSlidingWindow).toHaveBeenCalledWith(
      ['pwd-login-fail', 'id-day', 'h1'],
      LOGIN_FAILURES_PER_ACCOUNT_DAY,
      24 * 3600,
    );
  });

  it('counting never breaks the answer (Redis down)', async () => {
    const { throttle, redis } = make();
    redis.eval.mockRejectedValue(new Error('down'));
    await expect(
      throttle.recordFailure('h1', '1.2.3.4'),
    ).resolves.toBeUndefined();
  });

  it('the right password clears only its own source', async () => {
    const { throttle, redis } = make();
    await throttle.recordSuccess('h1', '1.2.3.4');
    expect(redis.del).toHaveBeenCalledWith('auth:pwd-backoff:h1:1.2.3.4');
  });
});
