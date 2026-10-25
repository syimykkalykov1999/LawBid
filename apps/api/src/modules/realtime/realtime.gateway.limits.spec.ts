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

/** Owner 2026-10-25: per-user socket cap and per-address connect rate. */
function fakeSocket(id: string, ip = '5.5.5.5') {
  return {
    id,
    data: {} as Record<string, unknown>,
    handshake: { auth: { token: 'a.b.c' }, headers: {}, address: ip },
    use: jest.fn(),
    on: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function setup(limits: { perUser: number; perIp: number }) {
  const counts = new Map<string, number>();
  const redis = {
    srem: jest.fn(),
    incr: jest.fn((k: string) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return Promise.resolve(counts.get(k));
    }),
    expire: jest.fn().mockResolvedValue(1),
  };
  const log = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const settings = {
    number: jest.fn((key: string) =>
      Promise.resolve(
        (
          {
            'realtime.max_sockets_per_user': limits.perUser,
            'realtime.max_connects_per_ip_per_minute': limits.perIp,
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
      verifyAccessToken: jest.fn(() => ({
        sub: 'u1',
        sid: 's1',
        role: 'client',
      })),
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

  it('refuses connections from one address beyond the per-minute limit', async () => {
    const { gateway, log } = setup({ perUser: 10, perIp: 2 });
    const socks = ['a', 'b', 'c'].map((i) => fakeSocket(i));
    for (const s of socks)
      await gateway.handleConnection(s as unknown as Socket);
    expect(socks[2].emit).toHaveBeenCalledWith('auth:error', {
      code: 'RATE_LIMITED',
    });
    expect(socks[2].disconnect).toHaveBeenCalledWith(true);
    expect(socks[0].disconnect).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ws_ip_limited' }),
      expect.any(String),
    );
    // another address is unaffected
    const other = fakeSocket('d', '6.6.6.6');
    await gateway.handleConnection(other as unknown as Socket);
    expect(other.disconnect).not.toHaveBeenCalled();
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
