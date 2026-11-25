import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthModule } from '../auth.module';
import { PasskeyController } from '../passkeys/passkey.controller';
import { lastValueFrom, of } from 'rxjs';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  autoAllows,
  autoReplayAllows,
  emptyCounts,
  pendingKey,
  type BotCheckCounts,
} from '../../../common/security/bot-check-stats';
import { BidPacksController } from '../../bid-packs/bid-packs.controller';
import { ClientBadgeController } from '../../client-badge/client-badge.controller';
import { ClientPlansController } from '../../plans/client-plans.controller';
import { StarsController } from '../../stars/stars.controller';
import { AuthController } from '../auth.controller';
import {
  APP_CHECK_KEY,
  AppCheckGuard,
  BOT_CHECK_REQ_KEY,
  type AppCheckOptions,
  parseRouteSwitch,
} from './app-check.guard';
import type { AppCheckResult } from './app-check.service';
import {
  BOT_CHECK_PROOF_KEY,
  BotCheckProofInterceptor,
} from './bot-check-proof.interceptor';

/**
 * Item 13 (L2, 2026-11-25): per-route-group Выкл / Вкл / Авто, the
 * proven-real pass rate behind «Авто», replay protection by switch, payment
 * starts. Every case here is red on the old guard (no groups, no stats).
 */
describe('bot check per route group (item 13)', () => {
  let settings: Record<string, unknown>;
  let result: AppCheckResult;
  let options: AppCheckOptions | undefined;
  let counts: BotCheckCounts;
  const verify = jest.fn<
    Promise<AppCheckResult>,
    [string | undefined, { consume?: boolean }?]
  >();
  const verifyAccessToken = jest.fn();
  const record = jest.fn();
  const rememberPending = jest.fn();
  const takePending = jest.fn();
  const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

  const stats = {
    record: (...a: unknown[]) => {
      record(...a);
      return Promise.resolve();
    },
    rememberPending: (...a: unknown[]) => {
      rememberPending(...a);
      return Promise.resolve();
    },
    takePending: (...a: unknown[]) => takePending(...a) as Promise<unknown>,
    counts: () => Promise.resolve(counts),
  };

  function guard(): AppCheckGuard {
    const reflector = {
      getAllAndOverride: () => options,
    } as unknown as Reflector;
    const read = (k: string, d: unknown) => Promise.resolve(settings[k] ?? d);
    return new AppCheckGuard(
      reflector,
      {
        string: (k: string) => read(k, ''),
        boolean: (k: string) => read(k, false),
        number: (k: string) => read(k, 0),
      } as never,
      { verify } as never,
      { verifyAccessToken } as never,
      logger as never,
      undefined,
      { isChallenged: () => Promise.resolve(false) } as never,
      stats as never,
    );
  }

  function ctx(
    headers: Record<string, string> = {},
    body: Record<string, unknown> = {
      channel: 'phone',
      identifier: '+14155552680',
    },
  ): { c: ExecutionContext; req: Record<string, unknown> } {
    const req: Record<string, unknown> = {
      method: 'POST',
      path: '/api/v1/auth/otp/request',
      route: { path: '/api/v1/auth/otp/request' },
      body,
      header: (name: string) => headers[name.toLowerCase()],
    };
    return {
      req,
      c: {
        getHandler: () => undefined,
        getClass: () => undefined,
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext,
    };
  }

  const many = (pass: number, total: number, platform = 'ios') => {
    const c = emptyCounts();
    c.total = total;
    c.pass = pass;
    c.byPlatform[platform as 'ios'] = { total, pass };
    return c;
  };

  beforeEach(() => {
    settings = {
      'security.app_check.mode': 'monitor',
      'security.turnstile.mode': 'off',
      'security.app_check.auto_days': 7,
      'security.app_check.auto_pass_rate_pct': 99,
      'security.app_check.auto_min_requests': 200,
    };
    result = { verdict: 'missing' };
    options = { group: 'sms' };
    counts = emptyCounts();
    verify.mockReset().mockImplementation(() => Promise.resolve(result));
    verifyAccessToken.mockReset().mockImplementation(() => {
      throw new Error('no token');
    });
    record.mockReset();
    rememberPending.mockReset();
    takePending.mockReset().mockResolvedValue(null);
    logger.info.mockReset();
  });

  describe('the «Авто» rule', () => {
    it('too few proven-real people: never enforces', () => {
      expect(autoAllows(many(199, 199), 99, 200)).toBe(false);
    });
    it('enough people and a high pass share: enforces', () => {
      expect(autoAllows(many(1000, 1000), 99, 200)).toBe(true);
      expect(autoAllows(many(990, 1000), 99, 200)).toBe(true);
      expect(autoAllows(many(989, 1000), 99, 200)).toBe(false);
    });
    it('one platform failing keeps it off even when the total is high', () => {
      const c = many(5000, 5000, 'ios');
      c.total += 300;
      c.pass += 240;
      c.byPlatform.android = { total: 300, pass: 240 };
      expect((c.pass * 100) / c.total).toBeGreaterThan(98.8);
      expect(autoAllows(c, 98, 200)).toBe(false);
    });
    it('replay auto waits until nearly every valid token is limited-use', () => {
      const c = emptyCounts();
      c.valid = 500;
      c.limited = 400;
      expect(autoReplayAllows(c, 99, 200)).toBe(false);
      c.limited = 498;
      expect(autoReplayAllows(c, 99, 200)).toBe(true);
    });
    it('an unknown switch value is off (a typo never blocks)', () => {
      expect(parseRouteSwitch('ON')).toBe('off');
      expect(parseRouteSwitch(undefined)).toBe('off');
      expect(parseRouteSwitch('auto')).toBe('auto');
    });
    it('pending keys never hold the phone number itself', () => {
      expect(pendingKey('sms', '+14155552680')).not.toContain('4155552680');
      expect(pendingKey('password_reset', 'A@B.com')).toBe(
        pendingKey('password_reset', 'a@b.com'),
      );
    });
  });

  it('off (default): the general monitor mode — logged, never blocked', async () => {
    const { c } = ctx();
    await expect(guard().canActivate(c)).resolves.toBe(true);
  });

  it('on: a request without a token is refused even while the general mode is monitor', async () => {
    settings['security.app_check.sms.mode'] = 'on';
    const { c } = ctx();
    await expect(guard().canActivate(c)).rejects.toMatchObject({
      response: { code: ErrorCode.DEVICE_ATTESTATION_REQUIRED },
    });
    result = { verdict: 'valid', appId: 'a' };
    await expect(
      guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }).c),
    ).resolves.toBe(true);
  });

  it('auto: logs only until the proven-real numbers allow, then enforces', async () => {
    settings['security.app_check.sms.mode'] = 'auto';
    counts = many(150, 150);
    await expect(guard().canActivate(ctx().c)).resolves.toBe(true);
    counts = many(995, 1000);
    await expect(guard().canActivate(ctx().c)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('the general enforce still works for a group left on off', async () => {
    settings['security.app_check.mode'] = 'enforce';
    await expect(guard().canActivate(ctx().c)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a code request leaves its verdict for the code check (rememberWhen)', async () => {
    options = { group: 'sms', rememberWhen: (b) => b.channel === 'phone' };
    result = { verdict: 'valid' };
    const { c, req } = ctx({
      'x-firebase-appcheck': 't',
      'x-firebase-appcheck-limited': '1',
      'x-platform': 'android',
    });
    await guard().canActivate(c);
    expect(rememberPending).toHaveBeenCalledWith('sms', '+14155552680', {
      pass: true,
      valid: true,
      limited: true,
      platform: 'android',
    });
    expect(req[BOT_CHECK_REQ_KEY]).toMatchObject({ group: 'sms', pass: true });
    rememberPending.mockClear();
    await guard().canActivate(
      ctx({}, { channel: 'email', identifier: 'a@b.com' }).c,
    );
    expect(rememberPending).not.toHaveBeenCalled();
  });

  it('the code check before any failure is watched, not blocked, unless its group is on', async () => {
    options = { challenge: 'otp', group: 'login' };
    await expect(guard().canActivate(ctx().c)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
    settings['security.app_check.login.mode'] = 'on';
    await expect(guard().canActivate(ctx().c)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('payments (signed-in)', () => {
    beforeEach(() => {
      options = { group: 'payments', signedIn: true, consumeWhen: () => true };
      verifyAccessToken.mockReset().mockReturnValue({ sub: 'u1' });
    });

    it('a signed-in payer is checked and counted at once', async () => {
      result = { verdict: 'valid' };
      await guard().canActivate(
        ctx({ authorization: 'Bearer x', 'x-firebase-appcheck': 't' }).c,
      );
      expect(verify).toHaveBeenCalledWith('t');
      expect(record).toHaveBeenCalledWith(
        'payments',
        expect.objectContaining({ pass: true }),
      );
    });

    it('the general enforce never blocks a payment; only its own switch does', async () => {
      settings['security.app_check.mode'] = 'enforce';
      await expect(
        guard().canActivate(ctx({ authorization: 'Bearer x' }).c),
      ).resolves.toBe(true);
      settings['security.app_check.payments.mode'] = 'on';
      await expect(
        guard().canActivate(ctx({ authorization: 'Bearer x' }).c),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('replay.mode on: an enforcing route consumes its token', async () => {
    settings['security.app_check.sms.mode'] = 'on';
    settings['security.app_check.replay.mode'] = 'on';
    options = { group: 'sms', consumeWhen: () => true };
    result = { verdict: 'valid' };
    await guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }).c);
    expect(verify).toHaveBeenCalledWith('t', { consume: true });
  });

  it('replay.mode auto: consumes only once the tokens are limited-use', async () => {
    settings['security.app_check.sms.mode'] = 'on';
    settings['security.app_check.replay.mode'] = 'auto';
    options = { group: 'sms', consumeWhen: () => true };
    result = { verdict: 'valid' };
    counts = emptyCounts();
    counts.valid = 300;
    counts.limited = 10;
    await guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }).c);
    expect(verify).toHaveBeenLastCalledWith('t');
    counts.limited = 300;
    await guard().canActivate(ctx({ 'x-firebase-appcheck': 't' }).c);
    expect(verify).toHaveBeenLastCalledWith('t', { consume: true });
  });

  describe('BotCheckProofInterceptor', () => {
    function intercept(meta: unknown, req: Record<string, unknown>) {
      const reflector = {
        getAllAndOverride: () => meta,
      } as unknown as Reflector;
      const i = new BotCheckProofInterceptor(reflector, stats as never);
      const c = {
        getHandler: () => undefined,
        getClass: () => undefined,
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;
      return lastValueFrom(i.intercept(c, { handle: () => of({ ok: 1 }) }));
    }

    it('a right code counts its own verdict and the SMS request verdict', async () => {
      const sample = {
        pass: false,
        valid: false,
        limited: false,
        platform: 'ios',
      };
      takePending.mockResolvedValue(sample);
      await intercept(
        { self: true, pending: ['sms'] },
        {
          body: { identifier: '+14155552680' },
          [BOT_CHECK_REQ_KEY]: { group: 'login', pass: true, valid: true },
        },
      );
      await new Promise((r) => setImmediate(r));
      expect(record).toHaveBeenCalledWith(
        'login',
        expect.objectContaining({ pass: true }),
      );
      expect(takePending).toHaveBeenCalledWith('sms', '+14155552680');
      expect(record).toHaveBeenCalledWith('sms', sample);
    });
  });

  // Item 13: the guard moved from @UseGuards on AuthController and
  // PasskeyController to one global APP_GUARD. Same routes, same checks.
  describe('global guard keeps auth and passkey routes exactly as before', () => {
    it('AuthModule registers AppCheckGuard as a global guard', () => {
      const providers = Reflect.getMetadata(
        'providers',
        AuthModule,
      ) as unknown[];
      expect(providers).toContainEqual({
        provide: APP_GUARD,
        useClass: AppCheckGuard,
      });
    });

    it('the same six auth routes are marked as before, nothing else', () => {
      const marked = Object.getOwnPropertyNames(AuthController.prototype)
        .filter((m) => m !== 'constructor')
        .filter((m) => {
          const fn = Object.getOwnPropertyDescriptor(
            AuthController.prototype,
            m,
          )!.value as object;
          return Reflect.getMetadata(APP_CHECK_KEY, fn) !== undefined;
        })
        .sort();
      expect(marked).toEqual(
        [
          'passwordLogin',
          'passwordResetRequest',
          'phoneStatus',
          'requestOtp',
          'social',
          'verifyOtp',
        ].sort(),
      );
    });

    it('passkey routes carry no mark: the guard passes them as before (it did nothing there)', () => {
      for (const m of Object.getOwnPropertyNames(PasskeyController.prototype)) {
        if (m === 'constructor') continue;
        const fn = Object.getOwnPropertyDescriptor(
          PasskeyController.prototype,
          m,
        )!.value as object;
        expect(Reflect.getMetadata(APP_CHECK_KEY, fn)).toBeUndefined();
      }
      expect(
        Reflect.getMetadata(APP_CHECK_KEY, PasskeyController),
      ).toBeUndefined();
    });
  });

  describe('routes carry their group', () => {
    const meta = (cls: object, method: string, key = APP_CHECK_KEY) =>
      Reflect.getMetadata(
        key,
        Object.getOwnPropertyDescriptor(
          (cls as { prototype: object }).prototype,
          method,
        )!.value as object,
      ) as Record<string, unknown> | undefined;

    it('sign-in routes', () => {
      expect(meta(AuthController, 'requestOtp')).toMatchObject({
        group: 'sms',
      });
      expect(meta(AuthController, 'phoneStatus')).toMatchObject({
        group: 'sms',
      });
      expect(meta(AuthController, 'verifyOtp')).toMatchObject({
        group: 'login',
      });
      expect(meta(AuthController, 'social')).toMatchObject({ group: 'login' });
      expect(meta(AuthController, 'passwordResetRequest')).toMatchObject({
        group: 'password_reset',
      });
      expect(meta(AuthController, 'verifyOtp', BOT_CHECK_PROOF_KEY)).toEqual({
        self: true,
        pending: ['sms'],
      });
      expect(
        meta(AuthController, 'passwordResetConfirm', BOT_CHECK_PROOF_KEY),
      ).toEqual({ pending: ['password_reset'] });
    });

    it('payment starts', () => {
      for (const [cls, m] of [
        [ClientPlansController, 'clientPlanCheckout'],
        [ClientBadgeController, 'startClientBadgeCheckout'],
        [StarsController, 'buyStars'],
        [BidPacksController, 'buyBidPack'],
      ] as const) {
        expect(meta(cls, m)).toMatchObject({
          group: 'payments',
          signedIn: true,
        });
      }
    });
  });
});
