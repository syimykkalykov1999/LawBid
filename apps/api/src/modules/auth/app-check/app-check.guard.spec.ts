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
  let result: AppCheckResult;
  let options: AppCheckOptions | undefined;
  const verify = jest.fn<Promise<AppCheckResult>, [string | undefined]>();
  const verifyAccessToken = jest.fn();
  const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

  function guard(): AppCheckGuard {
    const reflector = {
      getAllAndOverride: () => options,
    } as unknown as Reflector;
    return new AppCheckGuard(
      reflector,
      { string: () => Promise.resolve(mode) } as never,
      { verify } as never,
      { verifyAccessToken } as never,
      logger as never,
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
    mode = 'monitor';
    result = { verdict: 'missing' };
    options = {};
    verify.mockReset().mockImplementation(() => Promise.resolve(result));
    verifyAccessToken.mockReset().mockImplementation(() => {
      throw new Error('no token');
    });
    logger.info.mockReset();
    logger.error.mockReset();
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
});
