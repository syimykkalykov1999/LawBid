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
 * Verify 5b (C1, owner: «звонящий закрыл приложение — у второго звонит
 * минуту»): when the caller's LAST connection (cluster-wide, by the presence
 * set) closes, each 1:1 call they still ring gets one delayed
 * `calls.caller-gone` job with a per-call job id. Not when another
 * connection of theirs is still alive, not when the setting is 0.
 */
function setup(opts: { last: boolean; seconds: number }) {
  const findMany = jest.fn().mockResolvedValue([{ id: 'call-1' }]);
  const add = jest.fn().mockResolvedValue(true);
  const holdOffline = jest.fn().mockResolvedValue('tok');
  const gateway = new RealtimeGateway(
    {} as TokenService,
    {} as SessionRevocationService,
    { call: { findMany } } as unknown as PrismaService,
    {
      set: jest.fn().mockResolvedValue('OK'),
      zrem: jest.fn(),
    } as unknown as Redis,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger,
    {} as AssistantContextService,
    {
      leave: jest.fn().mockResolvedValue(opts.last),
      holdOffline,
      visible: jest.fn().mockResolvedValue(false),
    } as unknown as PresenceService,
    undefined,
    {
      number: jest.fn((k: string) =>
        Promise.resolve(k === 'calls.caller_gone_seconds' ? opts.seconds : 0),
      ),
    } as unknown as AppSettingsService,
    undefined,
    undefined,
    { add } as unknown as OneOffJobsQueue,
  );
  const socket = {
    id: 'sock-1',
    data: {
      user: { sub: 'caller', sid: 'chain', role: 'client' },
      viewing: new Set<string>(),
    },
  } as unknown as Socket;
  return { gateway, socket, findMany, add, holdOffline };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

describe('RealtimeGateway: caller gone while ringing (C1)', () => {
  it('last connection closed: one delayed caller-gone job per ringing 1:1 call', async () => {
    const w = setup({ last: true, seconds: 15 });
    await w.gateway.handleDisconnect(w.socket);
    await settle();
    expect(w.findMany).toHaveBeenCalledWith({
      where: { caller_id: 'caller', status: 'ringing', is_group: false },
      select: { id: true },
      take: 5,
    });
    expect(w.add).toHaveBeenCalledWith(
      'calls.caller-gone',
      { callId: 'call-1' },
      'caller-gone.call-1',
      15_000,
    );
    // presence hold still happens, with its token
    expect(w.holdOffline).toHaveBeenCalled();
  });

  it('another connection of the caller is still alive: nothing queued', async () => {
    const w = setup({ last: false, seconds: 15 });
    await w.gateway.handleDisconnect(w.socket);
    await settle();
    expect(w.findMany).not.toHaveBeenCalled();
    expect(w.add).not.toHaveBeenCalled();
  });

  it('calls.caller_gone_seconds = 0: off, not even a query', async () => {
    const w = setup({ last: true, seconds: 0 });
    await w.gateway.handleDisconnect(w.socket);
    await settle();
    expect(w.findMany).not.toHaveBeenCalled();
    // (the presence settle job of C4 is queued; no caller-gone one)
    expect(
      w.add.mock.calls.filter((c) => c[0] === 'calls.caller-gone'),
    ).toEqual([]);
  });
});
