import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { Socket } from 'socket.io';
import type { AssistantContextService } from '../auth/assistant/assistant-context';
import type { SessionRevocationService } from '../auth/services/session-revocation.service';
import type { TokenService } from '../auth/services/token.service';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { RealtimeGateway } from './realtime.gateway';
import { withEvalIncr } from '../../redis/incr-with-ttl.test-support';

/** Owner 2026-10-25: per-user socket cap and per-address connect rate. */
function fakeSocket(id: string, ip = '5.5.5.5', token = 'u:u1') {
  return {
    id,
    data: {} as Record<string, unknown>,
    handshake: { auth: { token }, headers: {}, address: ip },
    use: jest.fn(),
    on: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function setup(limits: {
  perUser: number;
  perIp: number;
  perUserConnects?: number;
}) {
  const counts = new Map<string, number>();
  const redis = withEvalIncr({
    srem: jest.fn(),
    incr: jest.fn((k: string) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return Promise.resolve(counts.get(k));
    }),
    expire: jest.fn().mockResolvedValue(1),
  });
  const log = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const settings = {
    number: jest.fn((key: string) =>
      Promise.resolve(
        (
          {
            'realtime.max_sockets_per_user': limits.perUser,
            'realtime.max_connects_per_ip_per_minute': limits.perIp,
            'realtime.max_connects_per_user_per_minute':
              limits.perUserConnects ?? 0,
            'realtime.server.auth_expiring_lead_seconds': 120,
            'realtime.server.auth_grace_seconds': 120,
            'realtime.server.going_away_spread_ms': 20000,
          } as Record<string, number>
        )[key],
      ),
    ),
  };
  const gateway = new RealtimeGateway(
    {
      // 'u:<id>' is a valid token of that person; anything else is invalid
      verifyAccessToken: jest.fn((t: string) => {
        if (!t.startsWith('u:')) throw new Error('bad token');
        return { sub: t.slice(2), sid: `s-${t}`, role: 'client' };
      }),
    } as unknown as TokenService,
    {
      isBlacklisted: jest.fn().mockResolvedValue(false),
    } as unknown as SessionRevocationService,
    {} as PrismaService,
    redis as unknown as Redis,
    log as unknown as PinoLogger,
    { resolve: jest.fn() } as unknown as AssistantContextService,
    {
      touch: jest.fn().mockResolvedValue(false),
      refresh: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(false),
      visible: jest.fn().mockResolvedValue(false),
    } as unknown as PresenceService,
    undefined,
    settings as unknown as AppSettingsService,
    undefined,
  );
  gateway.afterInit({ sockets: new Map(), server: {} } as never);
  return { gateway, log };
}

describe('RealtimeGateway limits (owner 2026-10-25)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('evicts the oldest socket of a user beyond the cap, with a reason and a metric', async () => {
    const { gateway, log } = setup({ perUser: 2, perIp: 0 });
    const [a, b, c] = ['a', 'b', 'c'].map((i) => fakeSocket(i));
    for (const s of [a, b, c])
      await gateway.handleConnection(s as unknown as Socket);
    expect(a.emit).toHaveBeenCalledWith('auth:error', {
      code: 'TOO_MANY_CONNECTIONS',
    });
    expect(a.disconnect).toHaveBeenCalledWith(true);
    expect(b.disconnect).not.toHaveBeenCalled();
    expect(c.disconnect).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ws_user_cap_evicted' }),
      expect.any(String),
    );
  });

  it('sockets with no valid token are counted per address', async () => {
    const { gateway, log } = setup({ perUser: 10, perIp: 2 });
    const socks = ['a', 'b', 'c'].map((i) => fakeSocket(i, '5.5.5.5', 'junk'));
    for (const s of socks)
      await gateway.handleConnection(s as unknown as Socket);
    await jest.advanceTimersByTimeAsync(0);
    expect(socks[2].emit).toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ws_ip_limited' }),
      expect.any(String),
    );
    // another address is unaffected
    const other = fakeSocket('d', '6.6.6.6', 'junk');
    await gateway.handleConnection(other as unknown as Socket);
    await jest.advanceTimersByTimeAsync(0);
    expect(other.emit).not.toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
  });

  it('signed-in people behind one address do not block each other', async () => {
    const { gateway } = setup({ perUser: 10, perIp: 2, perUserConnects: 5 });
    // 15 different people on one carrier address: above the anonymous limit
    // (2) but inside the signed-in safety net (10x = 20)
    for (let i = 0; i < 15; i++) {
      const s = fakeSocket(`p${i}`, '7.7.7.7', `u:p${i}`);
      await gateway.handleConnection(s as unknown as Socket);
      await jest.advanceTimersByTimeAsync(0);
      expect(s.disconnect).not.toHaveBeenCalled();
    }
  });

  it('one person reconnecting in a loop is cut by the per-user limit', async () => {
    const { gateway, log } = setup({
      perUser: 100,
      perIp: 600,
      perUserConnects: 3,
    });
    const socks = [1, 2, 3, 4].map((i) => fakeSocket(`l${i}`));
    for (const s of socks) {
      await gateway.handleConnection(s as unknown as Socket);
      await jest.advanceTimersByTimeAsync(0);
    }
    expect(socks[3].emit).toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
    expect(socks[2].emit).not.toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ws_user_limited' }),
      expect.any(String),
    );
  });

  it('the safety net still stops a flood of signed-in sockets from one address', async () => {
    const { gateway } = setup({ perUser: 10, perIp: 1, perUserConnects: 0 });
    const socks = Array.from({ length: 11 }, (_, i) =>
      fakeSocket(`f${i}`, '8.8.8.8', `u:f${i}`),
    );
    for (const s of socks) {
      await gateway.handleConnection(s as unknown as Socket);
      await jest.advanceTimersByTimeAsync(0);
    }
    expect(socks[10].emit).toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
    expect(socks[9].emit).not.toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
  });

  it('a forged forwarded address cannot pick a counter (no key collision with a person)', async () => {
    process.env.TRUST_PROXY_HOPS = '1';
    try {
      const { gateway, log } = setup({
        perUser: 10,
        perIp: 600,
        perUserConnects: 1,
      });
      const victim = fakeSocket('v1', '9.9.9.9', 'u:victim');
      await gateway.handleConnection(victim as unknown as Socket);
      await jest.advanceTimersByTimeAsync(0);
      const forged = fakeSocket('x1', '1.1.1.1', 'junk');
      (forged.handshake.headers as Record<string, string>)['x-forwarded-for'] =
        'u:victim';
      await gateway.handleConnection(forged as unknown as Socket);
      await jest.advanceTimersByTimeAsync(0);
      // the forged entry is not an address: nothing was counted for anyone
      expect(forged.emit).not.toHaveBeenCalledWith('auth:error', {
        code: 'RATE_LIMITED',
      });
      expect(log.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ metric: 'ws_user_limited' }),
        expect.any(String),
      );
    } finally {
      delete process.env.TRUST_PROXY_HOPS;
    }
  });

  it('limit 0 turns the address limit off', async () => {
    const { gateway } = setup({ perUser: 100, perIp: 0 });
    for (let i = 0; i < 5; i++) {
      const s = fakeSocket(`x${i}`);
      await gateway.handleConnection(s as unknown as Socket);
      expect(s.disconnect).not.toHaveBeenCalled();
    }
  });
});
