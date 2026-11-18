import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { Socket } from 'socket.io';
import type { AssistantContextService } from '../auth/assistant/assistant-context';
import type { SessionRevocationService } from '../auth/services/session-revocation.service';
import type { TokenService } from '../auth/services/token.service';
import type { PresenceService } from '../presence/presence.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { OneOffJobsQueue } from '../../jobs/one-off-jobs.queue';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Verify 5b (C4): the last connection closing queues a delayed
 * `presence.settle` job (delay = the grace, job id per hold token) instead
 * of trusting this process's timer; the job's announce
 * (PRESENCE_SETTLED_CHANNEL) reaches this instance's watching sockets only
 * after the per-watcher "last seen" check.
 */
function setup(add = jest.fn().mockResolvedValue(true)) {
  const mayWatch = jest.fn((viewer: string) =>
    Promise.resolve(viewer === 'friend'),
  );
  const gateway = new RealtimeGateway(
    {} as TokenService,
    {} as SessionRevocationService,
    {
      call: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService,
    {} as unknown as Redis,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger,
    {} as AssistantContextService,
    {
      leave: jest.fn().mockResolvedValue(true),
      holdOffline: jest.fn().mockResolvedValue('tok-1'),
      settleOffline: jest.fn().mockResolvedValue(true),
      visible: jest.fn().mockResolvedValue(true),
      mayWatch,
    } as unknown as PresenceService,
    undefined,
    {
      number: jest.fn(() => Promise.resolve(0)),
    } as unknown as AppSettingsService,
    undefined,
    undefined,
    { add } as unknown as OneOffJobsQueue,
  );
  const socket = {
    id: 'sock-1',
    data: {
      user: { sub: 'u1', sid: 'chain', role: 'client' },
      viewing: new Set<string>(),
    },
  } as unknown as Socket;
  return { gateway, socket, add, mayWatch };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

describe('RealtimeGateway: presence offline settle survives a crash (C4)', () => {
  it('last connection closed: one delayed presence.settle job, no local timer', async () => {
    const w = setup();
    await w.gateway.handleDisconnect(w.socket);
    await settle();
    expect(w.add).toHaveBeenCalledWith(
      'presence.settle',
      expect.objectContaining({ userId: 'u1', token: 'tok-1' }),
      'presence-settle.u1.tok-1',
      10_000,
    );
    const timers = (
      w.gateway as unknown as { offlineTimers: Map<string, unknown> }
    ).offlineTimers;
    expect(timers.size).toBe(0);
  });

  it('queue down: falls back to the local timer', async () => {
    const w = setup(jest.fn().mockRejectedValue(new Error('redis down')));
    await w.gateway.handleDisconnect(w.socket);
    await settle();
    const timers = (
      w.gateway as unknown as {
        offlineTimers: Map<string, { timer: NodeJS.Timeout }>;
      }
    ).offlineTimers;
    expect(timers.size).toBe(1);
    clearTimeout(timers.get('u1')?.timer);
  });

  it('settled message: only allowed local watchers get offline; others leave the room', async () => {
    const w = setup();
    const friend = {
      data: { user: { sub: 'friend' } },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    const exContact = {
      data: { user: { sub: 'ex' } },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    const fetchSockets = jest.fn().mockResolvedValue([friend, exContact]);
    const cluster = jest.fn();
    const inRoom = jest.fn(() => ({
      local: { fetchSockets },
      fetchSockets: cluster,
    }));
    (w.gateway as unknown as { nsp: unknown }).nsp = { in: inRoom };
    await w.gateway.onPresenceSettled(
      JSON.stringify({ userId: 'u1', leftAt: '2026-11-17T20:00:00.000Z' }),
    );
    expect(inRoom).toHaveBeenCalledWith('presence:u1');
    expect(cluster).not.toHaveBeenCalled();
    expect(friend.emit).toHaveBeenCalledWith('presence:update', {
      userId: 'u1',
      online: false,
      lastSeenAt: '2026-11-17T20:00:00.000Z',
    });
    expect(exContact.emit).not.toHaveBeenCalled();
    expect(exContact.leave).toHaveBeenCalledWith('presence:u1');
  });
});
