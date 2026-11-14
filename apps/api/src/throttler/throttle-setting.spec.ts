import { Reflector } from '@nestjs/core';
import { signCallPoll, callPollKey } from '../common/calls/call-poll-token';
import { ringTicketTracker, THROTTLE_SETTING } from './throttle-setting';
import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * D1-19 (13.11): «does this call still ring?» is asked every few seconds
 * by each rung phone without a session. It is counted per call and person
 * by the ring ticket (not per address: three phones behind one office NAT
 * shared one bucket of 60), and its limit is the admin setting.
 */
describe('ring-status throttle', () => {
  const env = process.env.AUTH_EVENT_PEPPER;
  beforeEach(() => {
    process.env.AUTH_EVENT_PEPPER = 'test-pepper-for-ring';
  });
  afterEach(() => {
    if (env === undefined) delete process.env.AUTH_EVENT_PEPPER;
    else process.env.AUTH_EVENT_PEPPER = env;
  });

  const ticket = (c: string, u: string) =>
    signCallPoll(callPollKey('test-pepper-for-ring'), { c, u });

  it('a valid ticket is counted per call and person, not per address', async () => {
    const t1 = ticket('call-1', 'ann');
    const t2 = ticket('call-1', 'bob');
    const a = await ringTicketTracker({
      ip: '10.0.0.1',
      params: { id: 'call-1' },
      query: { t: t1 },
    });
    const b = await ringTicketTracker({
      ip: '10.0.0.1',
      params: { id: 'call-1' },
      query: { t: t2 },
    });
    expect(a).toBe('ring:call-1:ann');
    expect(b).toBe('ring:call-1:bob');
  });

  it('a forged, foreign or missing ticket stays per address', async () => {
    const other = ticket('call-2', 'ann');
    for (const req of [
      { ip: '10.0.0.9', params: { id: 'call-1' }, query: { t: other } },
      { ip: '10.0.0.9', params: { id: 'call-1' }, query: { t: 'cp1.x.y' } },
      { ip: '10.0.0.9', params: { id: 'call-1' }, query: {} },
    ]) {
      await expect(ringTicketTracker(req)).resolves.toBe('ip:10.0.0.9');
    }
  });

  function guardWith(setting: number | Error) {
    const storage = {
      increment: jest.fn().mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    };
    const settings = {
      number: jest.fn(() =>
        setting instanceof Error
          ? Promise.reject(setting)
          : Promise.resolve(setting),
      ),
    };
    const guard = new UserThrottlerGuard(
      { throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }] },
      storage,
      new Reflector(),
      {
        verifyAccessToken: jest.fn(() => {
          throw new Error('no');
        }),
        verifyAdminToken: jest.fn(() => {
          throw new Error('no');
        }),
      } as never,
      settings as never,
    );
    const handler = () => undefined;
    Reflect.defineMetadata('THROTTLER:LIMITdefault', 60, handler);
    Reflect.defineMetadata(
      'THROTTLER:TRACKERdefault',
      ringTicketTracker,
      handler,
    );
    Reflect.defineMetadata(
      THROTTLE_SETTING,
      'calls.ring_status_rate_limit_per_minute',
      handler,
    );
    const call = async (user = 'ann') => {
      const req = {
        ip: '10.0.0.1',
        headers: {},
        params: { id: 'call-1' },
        query: { t: ticket('call-1', user) },
      };
      const context = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => ({ header: jest.fn() }),
        }),
        getHandler: () => handler,
        getClass: () => class Route {},
      };
      await guard.onModuleInit();
      return guard.canActivate(context as never);
    };
    return { storage, settings, call };
  }

  it('reads the limit live from the admin setting, keyed by the ticket', async () => {
    const { storage, settings, call } = guardWith(240);
    await call();
    expect(settings.number).toHaveBeenCalledWith(
      'calls.ring_status_rate_limit_per_minute',
    );
    expect(storage.increment.mock.calls[0][2]).toBe(240);
    // Two phones behind the same address: two buckets.
    await call('bob');
    expect(storage.increment.mock.calls[1][0]).not.toBe(
      storage.increment.mock.calls[0][0],
    );
  });

  it('0 = no limit; an unreadable setting keeps the written 60', async () => {
    const off = guardWith(0);
    await expect(off.call()).resolves.toBe(true);
    expect(off.storage.increment).not.toHaveBeenCalled();
    const broken = guardWith(new Error('redis down'));
    await broken.call();
    expect(broken.storage.increment.mock.calls[0][2]).toBe(60);
  });
});
