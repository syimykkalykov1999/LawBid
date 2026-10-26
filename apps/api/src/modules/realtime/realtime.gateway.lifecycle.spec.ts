/* eslint-disable @typescript-eslint/no-unsafe-return -- hand-made Redis / socket fakes */
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { Socket } from 'socket.io';
import type { AssistantContextService } from '../auth/assistant/assistant-context';
import type { SessionRevocationService } from '../auth/services/session-revocation.service';
import type { TokenService } from '../auth/services/token.service';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { RealtimeStatsService } from '../../common/ops/realtime-stats.service';
import type { RealtimeEventLog } from './realtime-event-log';
import { RealtimeGateway, drainBudgetMs } from './realtime.gateway';

/**
 * Owner 2026-10-23 («связь пропала / восстановилась»): the access token
 * ending no longer cuts the socket (`auth:expiring` first, a refresh keeps
 * it, a grace period for apps that never refresh) and a stopping instance
 * tells its sockets to leave at random moments.
 */
const LEAD_MS = 120_000;
const GRACE_MS = 120_000;
const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);

/** A token-shaped string: only the payload's `exp` is read by the gateway. */
function jwt(expMs: number): string {
  const part = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ exp: Math.floor(expMs / 1000) })}.sig`;
}

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

function setup() {
  const tokens = {
    verifyAccessToken: jest.fn((t: string) => {
      if (t.endsWith('.bad')) throw new Error('bad token');
      return {
        sub: 'u1',
        sid: 'chain-a',
        role: 'client',
        verified: false,
        subscriptionStatus: 'none',
      };
    }),
  };
  const stats = {
    record: jest.fn(),
    recordDisconnect: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const eventLog = {
    currentSeq: jest.fn().mockResolvedValue(1234),
    since: jest.fn().mockResolvedValue({
      seq: 2000,
      events: [{ seq: 1500 }],
      complete: true,
    }),
  };
  const settings = {
    number: jest.fn((key: string) =>
      Promise.resolve(
        (
          {
            'realtime.server.auth_expiring_lead_seconds': LEAD_MS / 1000,
            'realtime.server.auth_grace_seconds': GRACE_MS / 1000,
            'realtime.server.going_away_spread_ms': 20_000,
          } as Record<string, number>
        )[key],
      ),
    ),
  };
  const gateway = new RealtimeGateway(
    tokens as unknown as TokenService,
    {
      isBlacklisted: jest.fn().mockResolvedValue(false),
    } as unknown as SessionRevocationService,
    {} as PrismaService,
    { srem: jest.fn() } as unknown as Redis,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger,
    { resolve: jest.fn() } as unknown as AssistantContextService,
    {
      touch: jest.fn().mockResolvedValue(false),
      touchCount: jest.fn().mockResolvedValue(1),
      leave: jest.fn().mockResolvedValue(false),
      visible: jest.fn().mockResolvedValue(false),
    } as unknown as PresenceService,
    stats as unknown as RealtimeStatsService,
    settings as unknown as AppSettingsService,
    eventLog as unknown as RealtimeEventLog,
  );
  const sockets = new Map<string, unknown>();
  gateway.afterInit({ sockets, server: {} } as never);
  return { gateway, stats, sockets, eventLog };
}

const emitted = (s: ReturnType<typeof fakeSocket>, event: string) =>
  s.emit.mock.calls.filter((c) => c[0] === event);

describe('RealtimeGateway token expiry (owner 2026-10-23)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => jest.useRealTimers());

  it('warns 120 s before the end, keeps the socket at the end, closes after the grace', async () => {
    const { gateway, stats } = setup();
    await jest.advanceTimersByTimeAsync(0); // timings loaded
    const exp = T0 + 900_000;
    const s = fakeSocket('s1', jwt(exp));
    await gateway.handleConnection(s as unknown as Socket);

    await jest.advanceTimersByTimeAsync(900_000 - LEAD_MS - 1000);
    expect(emitted(s, 'auth:expiring')).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(1000);
    const [, payload] = emitted(s, 'auth:expiring')[0] as [
      string,
      { expiresInMs: number; graceMs: number; expiresAt: string },
    ];
    expect(payload.expiresInMs).toBe(LEAD_MS);
    expect(payload.graceMs).toBe(GRACE_MS);
    expect(payload.expiresAt).toBe(new Date(exp).toISOString());
    expect(stats.record).toHaveBeenCalledWith('auth_expiring');

    // The token ends: the socket lives on (grace).
    await jest.advanceTimersByTimeAsync(LEAD_MS + GRACE_MS - 1000);
    expect(s.disconnect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);
    expect(s.emit).toHaveBeenCalledWith('auth:expired', {});
    expect(s.disconnect).toHaveBeenCalledWith(true);
    expect(stats.record).toHaveBeenCalledWith('auth_expired');
    await gateway.handleDisconnect(s as unknown as Socket);
  });

  it('auth:refresh {accessToken} keeps the socket and moves the warning', async () => {
    const { gateway, stats } = setup();
    await jest.advanceTimersByTimeAsync(0);
    const s = fakeSocket('s1', jwt(T0 + 900_000));
    await gateway.handleConnection(s as unknown as Socket);

    await jest.advanceTimersByTimeAsync(900_000 - LEAD_MS);
    expect(emitted(s, 'auth:expiring')).toHaveLength(1);

    const next = T0 + 900_000 - LEAD_MS + 900_000;
    const ack = await gateway.refresh(s as unknown as Socket, {
      accessToken: jwt(next),
    });
    expect(ack.ok).toBe(true);
    expect(ack.expiresAt).toBe(new Date(next).toISOString());
    expect(stats.record).toHaveBeenCalledWith('auth_refresh');

    // Past the old end + grace: still connected.
    await jest.advanceTimersByTimeAsync(LEAD_MS + GRACE_MS + 1000);
    expect(s.disconnect).not.toHaveBeenCalled();

    // The next token is warned about, too.
    await jest.advanceTimersByTimeAsync(
      900_000 - LEAD_MS - GRACE_MS - 1000 - 1000,
    );
    expect(emitted(s, 'auth:expiring')).toHaveLength(2);
    await gateway.handleDisconnect(s as unknown as Socket);
  });

  it("the older apps' {token} field still refreshes", async () => {
    const { gateway } = setup();
    const s = fakeSocket('s1', jwt(T0 + 900_000));
    await gateway.handleConnection(s as unknown as Socket);
    const ack = await gateway.refresh(s as unknown as Socket, {
      token: jwt(T0 + 1_800_000),
    });
    expect(ack.ok).toBe(true);
    await gateway.handleDisconnect(s as unknown as Socket);
  });

  it('a bad refresh token ends the socket', async () => {
    const { gateway } = setup();
    const s = fakeSocket('s1', jwt(T0 + 900_000));
    await gateway.handleConnection(s as unknown as Socket);
    const ack = await gateway.refresh(s as unknown as Socket, {
      accessToken: 'x.y.bad',
    });
    expect(ack).toEqual({ ok: false });
    expect(s.emit).toHaveBeenCalledWith('auth:error', { code: 'UNAUTHORIZED' });
    expect(s.disconnect).toHaveBeenCalledWith(true);
    await gateway.handleDisconnect(s as unknown as Socket);
  });

  it('tells a new socket where the event cursor is', async () => {
    const { gateway } = setup();
    const s = fakeSocket('s1', jwt(T0 + 900_000));
    await gateway.handleConnection(s as unknown as Socket);
    const [, ready] = emitted(s, 'realtime:ready')[0] as [
      string,
      { seq: number; authExpiresAt: string },
    ];
    expect(ready.seq).toBe(1234);
    expect(ready.authExpiresAt).toBe(new Date(T0 + 900_000).toISOString());
    await gateway.handleDisconnect(s as unknown as Socket);
  });

  it('sync:since answers with the missed events', async () => {
    const { gateway, eventLog, stats } = setup();
    const s = fakeSocket('s1', jwt(T0 + 900_000));
    await gateway.handleConnection(s as unknown as Socket);
    const ack = await gateway.syncSince(s as unknown as Socket, { seq: 1000 });
    expect(eventLog.since).toHaveBeenCalledWith(['u1'], 1000);
    expect(ack).toEqual({
      ok: true,
      seq: 2000,
      events: [{ seq: 1500 }],
      complete: true,
    });
    expect(stats.record).toHaveBeenCalledWith('sync');
    expect(
      await gateway.syncSince(s as unknown as Socket, { seq: 'x' }),
    ).toEqual({
      ok: false,
    });
    await gateway.handleDisconnect(s as unknown as Socket);
  });
});

describe('RealtimeGateway draining (owner 2026-10-23)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => jest.useRealTimers());

  it('sends server:going-away with a 0..20 s retry to every socket and refuses new ones', async () => {
    const { gateway, sockets, stats } = setup();
    await jest.advanceTimersByTimeAsync(0);
    const a = fakeSocket('a', jwt(T0 + 900_000));
    const b = fakeSocket('b', jwt(T0 + 900_000));
    sockets.set('a', a);
    sockets.set('b', b);

    const sent = await gateway.startDraining();
    expect(sent).toBe(2);
    expect(gateway.isDraining).toBe(true);
    for (const s of [a, b]) {
      const [, payload] = emitted(s, 'server:going-away')[0] as [
        string,
        { retryAfterMs: number },
      ];
      expect(payload.retryAfterMs).toBeGreaterThanOrEqual(0);
      expect(payload.retryAfterMs).toBeLessThanOrEqual(20_000);
    }
    expect(stats.record).toHaveBeenCalledWith('going_away');

    // A second call changes nothing; a new connection is turned away.
    expect(await gateway.startDraining()).toBe(0);
    const late = fakeSocket('c', jwt(T0 + 900_000));
    await gateway.handleConnection(late as unknown as Socket);
    expect(emitted(late, 'server:going-away')).toHaveLength(1);
    expect(late.disconnect).toHaveBeenCalledWith(true);
    expect(late.join).not.toHaveBeenCalled();
  });

  it('the drain budget: production waits for the clients, dev and tests do not', () => {
    expect(drainBudgetMs({ NODE_ENV: 'production' })).toBe(35_000);
    expect(drainBudgetMs({ NODE_ENV: 'development' })).toBe(0);
    expect(drainBudgetMs({ NODE_ENV: 'test' })).toBe(0);
    expect(
      drainBudgetMs({ NODE_ENV: 'production', REALTIME_DRAIN_MAX_MS: '1000' }),
    ).toBe(1000);
  });
});
