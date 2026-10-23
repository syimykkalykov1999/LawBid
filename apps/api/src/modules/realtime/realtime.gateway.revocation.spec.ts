import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { Socket } from 'socket.io';
import type { AssistantContextService } from '../auth/assistant/assistant-context';
import type { SessionRevocationService } from '../auth/services/session-revocation.service';
import type { TokenService } from '../auth/services/token.service';
import type { PresenceService } from '../presence/presence.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { SESSION_REVOKED_CHANNEL } from '../../redis/session-revoked';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Owner 2026-10-22 (server load audit, finding 5): the session is checked
 * once at the handshake; afterwards a `session:revoked` message drops the
 * session's sockets — no per-socket blacklist poll every 45 s.
 */
function fakeSocket(id: string, token: string) {
  return {
    id,
    data: {} as Record<string, unknown>,
    handshake: { auth: { token }, headers: {} },
    use: jest.fn(),
    on: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function setup(maxSockets?: number) {
  const claimsByToken: Record<string, { sub: string; sid: string }> = {
    'tok-a1': { sub: 'u1', sid: 'chain-a' },
    'tok-a2': { sub: 'u1', sid: 'chain-a' },
    'tok-b': { sub: 'u2', sid: 'chain-b' },
    'tok-c': { sub: 'u1', sid: 'chain-c' },
  };
  const tokens = {
    verifyAccessToken: jest.fn((t: string) => ({
      ...claimsByToken[t],
      role: 'client',
      verified: false,
      subscriptionStatus: 'none',
    })),
  };
  const revocation = { isBlacklisted: jest.fn().mockResolvedValue(false) };
  const presence = {
    touch: jest.fn().mockResolvedValue(false),
    leave: jest.fn().mockResolvedValue(false),
    visible: jest.fn().mockResolvedValue(false),
  };
  const gateway = new RealtimeGateway(
    tokens as unknown as TokenService,
    revocation as unknown as SessionRevocationService,
    {} as PrismaService,
    { srem: jest.fn() } as unknown as Redis,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger,
    { resolve: jest.fn() } as unknown as AssistantContextService,
    presence as unknown as PresenceService,
    undefined,
    {
      number: jest.fn().mockResolvedValue(maxSockets ?? 10),
    } as unknown as AppSettingsService,
  );
  return { gateway, revocation, presence };
}

const revoked = (sessionId: string, userId?: string) =>
  JSON.stringify({ sessionId, ...(userId ? { userId } : {}) });

describe('RealtimeGateway session revocation (finding 5)', () => {
  afterEach(() => jest.useRealTimers());

  it('drops every socket of the revoked session, only those', async () => {
    const { gateway } = setup();
    const a1 = fakeSocket('s1', 'tok-a1');
    const a2 = fakeSocket('s2', 'tok-a2');
    const b = fakeSocket('s3', 'tok-b');
    for (const s of [a1, a2, b]) {
      await gateway.handleConnection(s as unknown as Socket);
    }
    gateway.onSessionRevoked(revoked('chain-a', 'u1'));
    for (const s of [a1, a2]) {
      expect(s.emit).toHaveBeenCalledWith('auth:error', {
        code: 'AUTH_SESSION_REVOKED',
      });
      expect(s.disconnect).toHaveBeenCalledWith(true);
    }
    expect(b.disconnect).not.toHaveBeenCalled();
    // A repeat (another instance's revoke of the same chain) is a no-op.
    gateway.onSessionRevoked(revoked('chain-a'));
    expect(a1.disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed messages and unknown sessions', async () => {
    const { gateway } = setup();
    const b = fakeSocket('s3', 'tok-b');
    await gateway.handleConnection(b as unknown as Socket);
    gateway.onSessionRevoked('not json');
    gateway.onSessionRevoked(JSON.stringify({ userId: 'u2' }));
    gateway.onSessionRevoked(revoked('chain-zzz'));
    expect(b.disconnect).not.toHaveBeenCalled();
  });

  it('a disconnected socket leaves the index', async () => {
    const { gateway } = setup();
    const b = fakeSocket('s3', 'tok-b');
    await gateway.handleConnection(b as unknown as Socket);
    await gateway.handleDisconnect(b as unknown as Socket);
    gateway.onSessionRevoked(revoked('chain-b'));
    expect(b.emit).not.toHaveBeenCalledWith('auth:error', expect.anything());
  });

  it('auth:refresh into another session moves the socket', async () => {
    const { gateway } = setup();
    const s = fakeSocket('s1', 'tok-a1');
    await gateway.handleConnection(s as unknown as Socket);
    await gateway.refresh(s as unknown as Socket, { token: 'tok-c' });
    gateway.onSessionRevoked(revoked('chain-a'));
    expect(s.disconnect).not.toHaveBeenCalled();
    gateway.onSessionRevoked(revoked('chain-c'));
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });

  it('no per-socket blacklist poll: checked once, at the handshake', async () => {
    jest.useFakeTimers();
    const { gateway, revocation, presence } = setup();
    const s = fakeSocket('s1', 'tok-a1');
    await gateway.handleConnection(s as unknown as Socket);
    expect(revocation.isBlacklisted).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10 * 45_000);
    expect(revocation.isBlacklisted).toHaveBeenCalledTimes(1);
    // The presence heartbeat still runs.
    expect(presence.touch.mock.calls.length).toBeGreaterThanOrEqual(10);
    await gateway.handleDisconnect(s as unknown as Socket);
  });

  it('caps the sockets of one person on this instance, oldest closed first (scale audit 2026-10-23)', async () => {
    const { gateway } = setup(2);
    const first = fakeSocket('s1', 'tok-a1');
    const second = fakeSocket('s2', 'tok-a2');
    const third = fakeSocket('s3', 'tok-c');
    const other = fakeSocket('s4', 'tok-b');
    for (const s of [first, second, third, other]) {
      await gateway.handleConnection(s as unknown as Socket);
    }
    expect(first.emit).toHaveBeenCalledWith('auth:error', {
      code: 'TOO_MANY_CONNECTIONS',
    });
    expect(first.disconnect).toHaveBeenCalledWith(true);
    expect(second.disconnect).not.toHaveBeenCalled();
    expect(third.disconnect).not.toHaveBeenCalled();
    expect(other.disconnect).not.toHaveBeenCalled();
    // A closed socket frees its place.
    await gateway.handleDisconnect(second as unknown as Socket);
    const fourth = fakeSocket('s5', 'tok-a1');
    await gateway.handleConnection(fourth as unknown as Socket);
    expect(third.disconnect).not.toHaveBeenCalled();
  });

  it('listens on the session:revoked channel', () => {
    const handlers: Record<string, (c: string, m: string) => void> = {};
    const sub = {
      on: jest.fn((ev: string, fn: (c: string, m: string) => void) => {
        handlers[ev] = fn;
      }),
      subscribe: jest.fn().mockResolvedValue(1),
    };
    const redis = {
      duplicate: jest
        .fn()
        .mockReturnValueOnce({ spublish: jest.fn() })
        .mockReturnValueOnce({ ssubscribe: jest.fn(), on: jest.fn() })
        .mockReturnValueOnce(sub),
      srem: jest.fn(),
    };
    const gateway = new RealtimeGateway(
      {} as TokenService,
      {} as SessionRevocationService,
      {} as PrismaService,
      redis as unknown as Redis,
      { setContext: jest.fn(), warn: jest.fn() } as unknown as PinoLogger,
      {} as AssistantContextService,
      {} as PresenceService,
    );
    const adapter = jest.fn();
    const spy = jest.spyOn(gateway, 'onSessionRevoked');
    gateway.afterInit({ name: '/realtime', server: { adapter } } as never);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(sub.subscribe).toHaveBeenCalledWith(SESSION_REVOKED_CHANNEL);
    handlers.message('other', revoked('x'));
    expect(spy).not.toHaveBeenCalled();
    handlers.message(SESSION_REVOKED_CHANNEL, revoked('x'));
    expect(spy).toHaveBeenCalledWith(revoked('x'));
  });
});
