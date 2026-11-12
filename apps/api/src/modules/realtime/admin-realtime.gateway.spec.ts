import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { Socket } from 'socket.io';
import type { AdminCountsService } from '../admin/admin-counts.service';
import type { AdminSessionService } from '../admin-auth/admin-session.service';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { ADMINS_ROOM, adminTicketKey } from './realtime-publisher.service';

const TICKET = 'abcdefghijklmnopqrstuvwxyz012345';

function fakeSocket(id: string, ticket: unknown) {
  return {
    id,
    data: {} as Record<string, unknown>,
    handshake: { auth: { ticket }, headers: {}, address: '10.0.0.1' },
    use: jest.fn(),
    on: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function setup(opts: { owner?: string | null } = {}) {
  const store = new Map<string, string>();
  const redis = {
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    getdel: jest.fn((k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return Promise.resolve(v);
    }),
  };
  const sessions = {
    ownerOf: jest.fn<Promise<string | null>, [string]>(() =>
      Promise.resolve(opts.owner === undefined ? 'admin-1' : opts.owner),
    ),
  };
  const counts = { get: jest.fn(() => Promise.resolve({})) };
  const emitted: unknown[] = [];
  const nsp = {
    sockets: new Map<string, unknown>(),
    local: {
      to: jest.fn(() => ({
        emit: jest.fn((event: string, data: unknown) => {
          emitted.push([event, data]);
        }),
      })),
    },
  };
  const gateway = new AdminRealtimeGateway(
    redis as unknown as Redis,
    { setContext: jest.fn(), warn: jest.fn() } as unknown as PinoLogger,
    sessions as unknown as AdminSessionService,
    counts as unknown as AdminCountsService,
  );
  gateway.afterInit(nsp as never);
  const issue = (ticket = TICKET, countries: string[] | null = null) =>
    store.set(
      adminTicketKey(ticket),
      JSON.stringify({ adminId: 'admin-1', sessionId: 'sess-1', countries }),
    );
  return { gateway, redis, sessions, counts, nsp, emitted, issue, store };
}

afterEach(() => jest.useRealTimers());

describe('AdminRealtimeGateway', () => {
  it('a valid one-shot ticket joins the admins room and is gone afterwards', async () => {
    const t = setup();
    t.issue();
    const s = fakeSocket('s1', TICKET);
    await t.gateway.handleConnection(s as unknown as Socket);
    expect(s.join).toHaveBeenCalledWith(ADMINS_ROOM);
    expect(s.emit).toHaveBeenCalledWith('admin:ready', expect.anything());
    expect(s.disconnect).not.toHaveBeenCalled();
    expect(s.data).toEqual({
      adminId: 'admin-1',
      sessionId: 'sess-1',
      countries: null,
    });
    expect(t.store.size).toBe(0);
    // The same ticket a second time: nothing.
    const s2 = fakeSocket('s2', TICKET);
    await t.gateway.handleConnection(s2 as unknown as Socket);
    expect(s2.emit).toHaveBeenCalledWith('auth:error', {
      code: 'UNAUTHORIZED',
    });
    expect(s2.disconnect).toHaveBeenCalledWith(true);
  });

  it('a missing, malformed or foreign ticket and an ended session are refused', async () => {
    const t = setup({ owner: null });
    for (const bad of [undefined, 42, 'short', 'has space in it!!']) {
      const s = fakeSocket('x', bad);
      await t.gateway.handleConnection(s as unknown as Socket);
      expect(s.emit).toHaveBeenCalledWith('auth:error', {
        code: 'VALIDATION_ERROR',
      });
      expect(s.disconnect).toHaveBeenCalledWith(true);
    }
    t.issue();
    const ended = fakeSocket('e', TICKET);
    await t.gateway.handleConnection(ended as unknown as Socket);
    expect(ended.emit).toHaveBeenCalledWith('auth:error', {
      code: 'UNAUTHORIZED',
    });
    expect(ended.join).not.toHaveBeenCalled();
  });

  it('owner 12.11: only failed handshakes count per address; good ones never do', async () => {
    const t = setup();
    let failures = 0;
    const rateLimit = {
      peekFixedWindow: jest.fn(() => Promise.resolve(failures)),
      consumeFixedWindow: jest.fn(() => {
        failures += 1;
        return Promise.resolve({ allowed: true });
      }),
    };
    const gateway = new AdminRealtimeGateway(
      t.redis as unknown as Redis,
      { setContext: jest.fn(), warn: jest.fn() } as unknown as PinoLogger,
      t.sessions as unknown as AdminSessionService,
      t.counts as unknown as AdminCountsService,
      rateLimit as never,
    );
    gateway.afterInit(t.nsp as never);
    for (let i = 0; i < 400; i++) {
      t.issue();
      const s = fakeSocket(`ok${i}`, TICKET);
      await gateway.handleConnection(s as unknown as Socket);
      expect(s.emit).toHaveBeenCalledWith('admin:ready', expect.anything());
    }
    expect(rateLimit.consumeFixedWindow).not.toHaveBeenCalled();
    // A bad ticket counts; at 300 failures the address is refused.
    const bad = fakeSocket('bad', TICKET);
    await gateway.handleConnection(bad as unknown as Socket);
    expect(rateLimit.consumeFixedWindow).toHaveBeenCalledTimes(1);
    failures = 300;
    t.issue();
    const blocked = fakeSocket('blocked', TICKET);
    await gateway.handleConnection(blocked as unknown as Socket);
    expect(blocked.emit).toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
  });

  it('the socket only listens: a packet from the browser ends it', async () => {
    const t = setup();
    t.issue();
    const s = fakeSocket('s1', TICKET);
    await t.gateway.handleConnection(s as unknown as Socket);
    const guard = s.use.mock.calls[0][0] as (
      p: unknown,
      next: (e?: Error) => void,
    ) => void;
    const next = jest.fn();
    guard(['admin:changed'], next);
    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('relays adm:changed to the local admins room', () => {
    const t = setup();
    t.gateway.onChanged('admin-counts');
    expect(t.nsp.local.to).toHaveBeenCalledWith(ADMINS_ROOM);
    expect(t.emitted).toEqual([
      ['admin:changed', { key: 'admin-counts', at: expect.any(String) }],
    ]);
  });

  it('tick: drops sockets whose session ended, refreshes counts once per scope', async () => {
    const t = setup();
    const alive = fakeSocket('a', TICKET);
    alive.data = { adminId: 'admin-1', sessionId: 'sess-1', countries: ['US'] };
    const alive2 = fakeSocket('a2', TICKET);
    alive2.data = {
      adminId: 'admin-1',
      sessionId: 'sess-1',
      countries: ['US'],
    };
    const gone = fakeSocket('g', TICKET);
    gone.data = { adminId: 'admin-2', sessionId: 'sess-2', countries: null };
    t.nsp.sockets.set('a', alive);
    t.nsp.sockets.set('a2', alive2);
    t.nsp.sockets.set('g', gone);
    t.sessions.ownerOf.mockImplementation((sid: string) =>
      Promise.resolve(sid === 'sess-1' ? 'admin-1' : null),
    );
    await t.gateway.tick();
    expect(gone.emit).toHaveBeenCalledWith('auth:error', {
      code: 'SESSION_ENDED',
    });
    expect(gone.disconnect).toHaveBeenCalledWith(true);
    expect(alive.disconnect).not.toHaveBeenCalled();
    // «an admin is looking» for the summaries cron, one counts read per scope
    expect(t.redis.set).toHaveBeenCalledWith(
      'ops:admin-active',
      '1',
      'EX',
      600,
    );
    expect(t.counts.get).toHaveBeenCalledTimes(1);
    expect(t.counts.get).toHaveBeenCalledWith(['US']);
  });

  it('tick with no sockets does nothing', async () => {
    const t = setup();
    await t.gateway.tick();
    expect(t.sessions.ownerOf).not.toHaveBeenCalled();
    expect(t.counts.get).not.toHaveBeenCalled();
    expect(t.redis.set).not.toHaveBeenCalled();
  });
});
