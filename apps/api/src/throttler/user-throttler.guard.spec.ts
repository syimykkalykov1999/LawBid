import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { UserThrottlerGuard } from './user-throttler.guard';
import { ADMIN_BLOCK_MS, ADMIN_THROTTLE_DEFAULT } from './throttle-limits';

class Route {}

function setup(
  opts: {
    setting?: number | Error;
    routeLimit?: number;
  } = {},
) {
  const storage = {
    increment: jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  };
  const tokens = {
    verifyAccessToken: jest.fn((t: string) => {
      if (t.startsWith('user-')) return { sub: t.slice(5) };
      throw new Error('not a user token');
    }),
    verifyAdminToken: jest.fn((t: string) => {
      if (t.startsWith('admin-')) return { sub: t.slice(6) };
      throw new Error('not an admin token');
    }),
  };
  const settings = {
    number: jest.fn(() =>
      opts.setting instanceof Error
        ? Promise.reject(opts.setting)
        : Promise.resolve(opts.setting ?? ADMIN_THROTTLE_DEFAULT),
    ),
  };
  const reflector = new Reflector();
  const guard = new UserThrottlerGuard(
    { throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }] },
    storage,
    reflector,
    tokens as never,
    settings as never,
  );
  // A fresh route handler per test, carrying @Throttle's metadata if any.
  const handler = () => undefined;
  if (opts.routeLimit !== undefined) {
    Reflect.defineMetadata('THROTTLER:LIMITdefault', opts.routeLimit, handler);
  }
  const res = { header: jest.fn() };
  const call = async (authorization?: string) => {
    const req = { ip: '10.0.0.1', headers: { authorization } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      getHandler: () => handler,
      getClass: () => Route,
    };
    await guard.onModuleInit();
    return guard.canActivate(context as never);
  };
  return { guard, storage, tokens, settings, call };
}

describe('UserThrottlerGuard', () => {
  const env = process.env.ADMIN_THROTTLE_LIMIT;
  afterEach(() => {
    if (env === undefined) delete process.env.ADMIN_THROTTLE_LIMIT;
    else process.env.ADMIN_THROTTLE_LIMIT = env;
  });

  it('gives a signed-in admin its own key, the admin limit and a short block', async () => {
    const { storage, call } = setup();
    await call('Bearer admin-a1');
    expect(storage.increment).toHaveBeenCalledWith(
      expect.any(String),
      60_000,
      ADMIN_THROTTLE_DEFAULT,
      ADMIN_BLOCK_MS,
      'default',
    );
  });

  it('keeps users and anonymous callers at the default 100/min and 60 s block', async () => {
    const { storage, call } = setup();
    await call('Bearer user-u1');
    await call();
    expect(storage.increment).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      60_000,
      100,
      60_000,
      'default',
    );
    expect(storage.increment).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      60_000,
      100,
      60_000,
      'default',
    );
  });

  it('reads the admin limit from Система → Настройки', async () => {
    const { storage, settings, call } = setup({ setting: 1500 });
    await call('Bearer admin-a1');
    expect(settings.number).toHaveBeenCalledWith(
      'security.admin_rate_limit_per_minute',
    );
    expect(storage.increment.mock.calls[0][2]).toBe(1500);
  });

  it('lets ADMIN_THROTTLE_LIMIT win over the setting', async () => {
    process.env.ADMIN_THROTTLE_LIMIT = '2000';
    const { storage, call } = setup({ setting: 150 });
    await call('Bearer admin-a1');
    expect(storage.increment.mock.calls[0][2]).toBe(2000);
  });

  it('falls back to the default admin limit when settings are unreachable', async () => {
    const { storage, call } = setup({ setting: new Error('redis down') });
    await call('Bearer admin-a1');
    expect(storage.increment.mock.calls[0][2]).toBe(ADMIN_THROTTLE_DEFAULT);
  });

  it("keeps a route's own @Throttle limit for admins", async () => {
    const { storage, call } = setup({ routeLimit: 30 });
    await call('Bearer admin-a1');
    expect(storage.increment.mock.calls[0][2]).toBe(30);
  });

  it('verifies the token once per request', async () => {
    const { tokens, call } = setup();
    await call('Bearer admin-a1');
    expect(tokens.verifyAdminToken).toHaveBeenCalledTimes(1);
  });

  it('answers 429 once the storage reports a block', async () => {
    const { storage, call } = setup();
    storage.increment.mockResolvedValueOnce({
      totalHits: 601,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 5,
    });
    await expect(call('Bearer admin-a1')).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });
});
