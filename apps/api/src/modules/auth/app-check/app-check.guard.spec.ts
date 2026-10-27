import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  APP_CHECK_KEY,
  AppCheckGuard,
  type AppCheckOptions,
  parseAppCheckMode,
} from './app-check.guard';
import type { AppCheckResult } from './app-check.service';

/** Security research #5 (2026-10-22), A4. */
describe('AppCheckGuard', () => {
  let mode: string;
  let tsMode: string;
  let result: AppCheckResult;
  let options: AppCheckOptions | undefined;
  const verify = jest.fn<
    Promise<AppCheckResult>,
    [string | undefined, { consume?: boolean }?]
  >();
  let replay = false;
  let challenged = false;
  const isChallenged = jest.fn();
  const tsVerify = jest.fn();
  const verifyAccessToken = jest.fn();
  const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

  function guard(): AppCheckGuard {
    const reflector = {
      getAllAndOverride: () => options,
    } as unknown as Reflector;
    return new AppCheckGuard(
      reflector,
      {
        string: (key: string) =>
          Promise.resolve(key === 'security.turnstile.mode' ? tsMode : mode),
        boolean: () => Promise.resolve(replay),
      } as never,
      { verify } as never,
      { verifyAccessToken } as never,
      logger as never,
      { verify: tsVerify } as never,
      { isChallenged } as never,
    );
  }

  function ctx(
    headers: Record<string, string> = {},
    body: Record<string, unknown> = { channel: 'phone' },
  ): ExecutionContext {
    const req = {
      method: 'POST',
      path: '/api/v1/auth/otp/request',
      route: { path: '/api/v1/auth/otp/request' },
      body,
      header: (name: string) => headers[name.toLowerCase()],
    };
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    replay = false;
    challenged = false;
    isChallenged
      .mockReset()
      .mockImplementation(() => Promise.resolve(challenged));
    mode = 'monitor';
    tsMode = 'off';
    tsVerify.mockReset();
    result = { verdict: 'missing' };
    options = {};
    verify.mockReset().mockImplementation(() => Promise.resolve(result));
    verifyAccessToken.mockReset().mockImplementation(() => {
      throw new Error('no token');
    });
    logger.info.mockReset();
    logger.error.mockReset();
  });

  describe('S14-7 replay protection (consume)', () => {
    const body = { channel: 'phone' };
    it('enforce + setting on: the SMS route consumes its token; a consumed one is refused', async () => {
      mode = 'enforce';
      replay = true;
      options = { consumeWhen: (b) => b.channel === 'phone' };
      result = { verdict: 'valid', appId: 'app' };
      await expect(
        guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }, body)),
      ).resolves.toBe(true);
      expect(verify).toHaveBeenCalledWith('t', { consume: true });
      result = { verdict: 'invalid', reason: 'already-consumed' };
      await expect(
        guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }, body)),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.DEVICE_ATTESTATION_REQUIRED },
      });
    });

    it('setting off, monitor mode, or a body that does not qualify: a plain verify', async () => {
      options = { consumeWhen: (b) => b.channel === 'phone' };
      result = { verdict: 'valid' };
      replay = true;
      await guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }, body));
      expect(verify).toHaveBeenLastCalledWith('t');
      mode = 'enforce';
      replay = false;
      await guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }, body));
      expect(verify).toHaveBeenLastCalledWith('t');
      replay = true;
      await guard().canActivate(
        ctx({ 'x-firebase-appcheck': 't' }, { channel: 'email' }),
      );
      expect(verify).toHaveBeenLastCalledWith('t');
    });
  });

  describe('S14-13 challenge after repeated failures', () => {
    it('not challenged: the route is open, nothing is verified (the happy path)', async () => {
      mode = 'off';
      options = { challenge: 'password' };
      await expect(
        guard().canActivate(ctx({}, { identifier: '+14155552680' })),
      ).resolves.toBe(true);
      expect(verify).not.toHaveBeenCalled();
    });

    it('challenged: a token is required even when App Check is off / monitor', async () => {
      challenged = true;
      options = { challenge: 'password' };
      for (const m of ['off', 'monitor']) {
        mode = m;
        verify.mockClear();
        result = { verdict: 'missing' };
        await expect(
          guard().canActivate(ctx({}, { identifier: '+14155552680' })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(isChallenged).toHaveBeenLastCalledWith(
          '+14155552680',
          undefined,
        );
      }
      result = { verdict: 'valid' };
      await expect(
        guard().canActivate(
          ctx({ 'x-firebase-appcheck': 'ok' }, { identifier: '+14155552680' }),
        ),
      ).resolves.toBe(true);
    });

    it('challenged but no Firebase project: never locks everyone out', async () => {
      challenged = true;
      options = { challenge: 'otp' };
      result = { verdict: 'unconfigured' };
      await expect(
        guard().canActivate(ctx({}, { identifier: '+14155552680' })),
      ).resolves.toBe(true);
    });
  });

  it('parses the admin setting and treats anything else as monitor', () => {
    expect(parseAppCheckMode('off')).toBe('off');
    expect(parseAppCheckMode('enforce')).toBe('enforce');
    expect(parseAppCheckMode('ENFORCE')).toBe('monitor');
    expect(parseAppCheckMode('')).toBe('monitor');
  });

  it('ignores routes without @RequireAppCheck', async () => {
    options = undefined;
    await expect(guard().canActivate(ctx())).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('off: never verifies', async () => {
    mode = 'off';
    await expect(guard().canActivate(ctx())).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('monitor: logs the verdict and lets a tokenless request through', async () => {
    await expect(guard().canActivate(ctx())).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith(undefined);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: 'app_check',
        verdict: 'missing',
        mode: 'monitor',
        route: 'POST /api/v1/auth/otp/request',
      }),
      'app check',
    );
  });

  it('monitor: an invalid token is logged with its reason, not blocked', async () => {
    result = { verdict: 'invalid', reason: 'app-check/invalid-argument' };
    await expect(
      guard().canActivate(ctx({ 'x-firebase-appcheck': 'bad' })),
    ).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('bad');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        verdict: 'invalid',
        reason: 'app-check/invalid-argument',
      }),
      'app check',
    );
  });

  it('enforce: a missing token is 403 DEVICE_ATTESTATION_REQUIRED', async () => {
    mode = 'enforce';
    const err = await guard()
      .canActivate(ctx())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: ErrorCode.DEVICE_ATTESTATION_REQUIRED,
    });
  });

  it('enforce: an invalid token is 403 too', async () => {
    mode = 'enforce';
    result = { verdict: 'invalid', reason: 'expired' };
    await expect(
      guard().canActivate(ctx({ 'x-firebase-appcheck': 'old' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforce: a valid token passes and the app id is logged', async () => {
    mode = 'enforce';
    result = { verdict: 'valid', appId: '1:123:ios:abc' };
    await expect(
      guard().canActivate(ctx({ 'x-firebase-appcheck': 'good' })),
    ).resolves.toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'valid', appId: '1:123:ios:abc' }),
      'app check',
    );
  });

  it('enforce: the free case (a code by e-mail) passes without a token', async () => {
    mode = 'enforce';
    options = { freeWhen: (b) => b.channel === 'email' };
    await expect(
      guard().canActivate(ctx({}, { channel: 'email' })),
    ).resolves.toBe(true);
    await expect(
      guard().canActivate(ctx({}, { channel: 'phone' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforce: a signed-in caller is exempt (own-number reauth)', async () => {
    mode = 'enforce';
    verifyAccessToken.mockImplementation(() => ({ sub: 'u1' }));
    await expect(
      guard().canActivate(ctx({ authorization: 'Bearer good' })),
    ).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('enforce without a Firebase project: lets the request through with an error log', async () => {
    mode = 'enforce';
    result = { verdict: 'unconfigured' };
    await expect(guard().canActivate(ctx())).resolves.toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it('a config read failure means monitor, never a lock-out', async () => {
    const reflector = {
      getAllAndOverride: () => ({}),
    } as unknown as Reflector;
    const g = new AppCheckGuard(
      reflector,
      { string: () => Promise.reject(new Error('redis down')) } as never,
      { verify } as never,
      { verifyAccessToken } as never,
      logger as never,
    );
    await expect(g.canActivate(ctx())).resolves.toBe(true);
  });

  it('exports the metadata key the decorator writes', () => {
    expect(APP_CHECK_KEY).toBe('app-check:required');
  });

  // 2026-10-24 (abuse batch B, item 4): Cloudflare Turnstile, web only.
  describe('Turnstile (security.turnstile.mode)', () => {
    it('off (default): the token is never checked', async () => {
      await guard().canActivate(ctx({ 'x-turnstile-token': 't' }));
      expect(tsVerify).not.toHaveBeenCalled();
    });

    it('with both switches off nothing at all is checked', async () => {
      mode = 'off';
      await expect(
        guard().canActivate(ctx({ 'x-turnstile-token': 't' })),
      ).resolves.toBe(true);
      expect(tsVerify).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });

    it('an unknown mode value counts as off', async () => {
      tsMode = 'ENFORCE';
      await guard().canActivate(ctx({ 'x-turnstile-token': 't' }));
      expect(tsVerify).not.toHaveBeenCalled();
    });

    it('enforce + valid token: passes even when App Check would refuse', async () => {
      mode = 'enforce';
      tsMode = 'enforce';
      tsVerify.mockResolvedValue({ verdict: 'valid', hostname: 'lawbid.dev' });
      await expect(
        guard().canActivate(ctx({ 'x-turnstile-token': 'good' })),
      ).resolves.toBe(true);
      expect(tsVerify).toHaveBeenCalledWith('good', { ip: undefined });
      expect(verify).not.toHaveBeenCalled();
    });

    it('enforce + invalid token: 403 TURNSTILE_FAILED', async () => {
      tsMode = 'enforce';
      tsVerify.mockResolvedValue({
        verdict: 'invalid',
        reason: 'timeout-or-duplicate',
      });
      await expect(
        guard().canActivate(ctx({ 'x-turnstile-token': 'bad' })),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.TURNSTILE_FAILED },
      });
    });

    it('monitor + invalid token: logged, not blocked, App Check rules go on', async () => {
      tsMode = 'monitor';
      tsVerify.mockResolvedValue({ verdict: 'invalid', reason: 'x' });
      await expect(
        guard().canActivate(ctx({ 'x-turnstile-token': 'bad' })),
      ).resolves.toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ metric: 'turnstile', verdict: 'invalid' }),
        'turnstile',
      );
      expect(verify).toHaveBeenCalled();
    });

    it('no token (the app): untouched, App Check decides', async () => {
      tsMode = 'enforce';
      mode = 'enforce';
      result = { verdict: 'valid' };
      await expect(guard().canActivate(ctx())).resolves.toBe(true);
      expect(tsVerify).not.toHaveBeenCalled();
      result = { verdict: 'missing' };
      await expect(guard().canActivate(ctx())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('Cloudflare down or no key saved: never locks the site out', async () => {
      tsMode = 'enforce';
      for (const verdict of ['unavailable', 'unconfigured']) {
        tsVerify.mockResolvedValue({ verdict });
        await expect(
          guard().canActivate(ctx({ 'x-turnstile-token': 't' })),
        ).resolves.toBe(true);
      }
      expect(logger.error).toHaveBeenCalled();
    });

    it('a signed-in caller is exempt', async () => {
      tsMode = 'enforce';
      verifyAccessToken.mockReturnValue({ sub: 'u1' });
      await expect(
        guard().canActivate(
          ctx({ authorization: 'Bearer abc', 'x-turnstile-token': 'bad' }),
        ),
      ).resolves.toBe(true);
      expect(tsVerify).not.toHaveBeenCalled();
    });
  });
});
