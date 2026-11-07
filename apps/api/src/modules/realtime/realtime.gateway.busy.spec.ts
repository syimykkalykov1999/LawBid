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

/** Load test 2026-11-02 (LOAD_RESILIENCE §4): a handshake the server cannot finish is a retry, not a wrong login. */
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

function setup(opts: { blacklist?: jest.Mock } = {}) {
  const redis = withEvalIncr({
    srem: jest.fn(),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  });
  const log = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const settings = {
    number: jest.fn((key: string) =>
      Promise.resolve(
        (
          {
            'realtime.max_sockets_per_user': 10,
            'realtime.max_connects_per_ip_per_minute': 0,
            'realtime.max_connects_per_user_per_minute': 0,
            'realtime.server.auth_expiring_lead_seconds': 120,
            'realtime.server.auth_grace_seconds': 120,
            'realtime.server.going_away_spread_ms': 20000,
          } as Record<string, number>
        )[key],
      ),
    ),
  };
  const blacklist = opts.blacklist ?? jest.fn().mockResolvedValue(false);
  const gateway = new RealtimeGateway(
    {
      verifyAccessToken: jest.fn((t: string) => {
        if (!t.startsWith('u:')) throw new Error('bad token');
        return { sub: t.slice(2), sid: `s-${t}`, role: 'client' };
      }),
    } as unknown as TokenService,
    { isBlacklisted: blacklist } as unknown as SessionRevocationService,
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
  return { gateway, log, blacklist };
}

const goingAway = expect.objectContaining({
  reason: 'busy',
  retryAfterMs: expect.any(Number),
});

describe('RealtimeGateway handshake the server cannot finish', () => {
  it('a revocation lookup that fails is a retry (going-away), not UNAUTHORIZED', async () => {
    const { gateway, log } = setup({
      blacklist: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const s = fakeSocket('a');
    await gateway.handleConnection(s as unknown as Socket);
    expect(s.emit).toHaveBeenCalledWith('server:going-away', goingAway);
    expect(s.emit).not.toHaveBeenCalledWith('auth:error', expect.anything());
    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ws_handshake_busy', why: 'verify' }),
      expect.any(String),
    );
  });

  it('a bad token and a revoked session stay UNAUTHORIZED', async () => {
    const bad = setup().gateway;
    const s1 = fakeSocket('a', '5.5.5.5', 'junk');
    await bad.handleConnection(s1 as unknown as Socket);
    expect(s1.emit).toHaveBeenCalledWith('auth:error', {
      code: 'UNAUTHORIZED',
    });
    const revoked = setup({ blacklist: jest.fn().mockResolvedValue(true) });
    const s2 = fakeSocket('b');
    await revoked.gateway.handleConnection(s2 as unknown as Socket);
    expect(s2.emit).toHaveBeenCalledWith('auth:error', {
      code: 'UNAUTHORIZED',
    });
    expect(s2.emit).not.toHaveBeenCalledWith('server:going-away', goingAway);
  });

  it('a room join that fails (Redis adapter) disconnects with a retry instead of leaving a deaf socket', async () => {
    const { gateway, log } = setup();
    const s = fakeSocket('a');
    s.join.mockRejectedValue(new Error('Connection is closed.'));
    await expect(
      gateway.handleConnection(s as unknown as Socket),
    ).resolves.toBeUndefined();
    expect(s.emit).toHaveBeenCalledWith('server:going-away', goingAway);
    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'ws_handshake_busy', why: 'finish' }),
      expect.any(String),
    );
  });

  it('a healthy handshake is untouched', async () => {
    const { gateway } = setup();
    const s = fakeSocket('a');
    await gateway.handleConnection(s as unknown as Socket);
    expect(s.disconnect).not.toHaveBeenCalled();
    expect(s.emit).not.toHaveBeenCalledWith(
      'server:going-away',
      expect.anything(),
    );
  });

  it('a join failure that is not Redis being away is not hidden behind a retry', async () => {
    const { gateway } = setup();
    const s = fakeSocket('a');
    s.join.mockRejectedValue(new Error('a real bug'));
    await expect(
      gateway.handleConnection(s as unknown as Socket),
    ).rejects.toThrow('a real bug');
    expect(s.emit).not.toHaveBeenCalledWith('server:going-away', goingAway);
  });
});
