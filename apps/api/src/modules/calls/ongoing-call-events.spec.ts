import type { Call, CallParticipant } from '@prisma/client';
import { CallsService } from './calls.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/**
 * Owner 2026-10-22 (load audit finding 3): a group's / channel's call is
 * pushed (`call:ongoing`, `call:ongoing_ended`) instead of being polled —
 * a group's members in their user rooms, a channel only to the sockets
 * that have it open (its room), never every subscriber.
 */
type Announce = (
  call: Call,
  rows?: CallParticipant[],
  ended?: boolean,
) => Promise<void>;

function service() {
  const realtime = { toUsers: jest.fn(), toRoom: jest.fn() };
  const groups = { activeMemberIds: jest.fn().mockResolvedValue(['u1', 'u2']) };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, { realtime, groups });
  const announce = (
    svc as unknown as { announceGroupCall: Announce }
  ).announceGroupCall.bind(svc);
  return { realtime, announce };
}

const call = (over: Partial<Call>): Call =>
  ({
    id: 'c1',
    group_id: null,
    channel_id: null,
    status: 'active',
    video: false,
    ...over,
  }) as Call;

const row = (user_id: string, status: string) =>
  ({ user_id, status }) as unknown as CallParticipant;

describe('running call events', () => {
  it("tells a group's members who is in its call", async () => {
    const { realtime, announce } = service();
    await announce(call({ group_id: 'g1' }), [
      row('u1', 'joined'),
      row('u2', 'invited'),
    ]);
    expect(realtime.toUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'call:ongoing',
      {
        callId: 'c1',
        groupId: 'g1',
        channelId: null,
        video: false,
        joined: 1,
        joinedIds: ['u1'],
        // Owner 2026-10-22 (package H): no Redis in this spec → 0.
        seq: 0,
      },
    );
    // Older app builds still refresh on this one.
    expect(realtime.toUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'group:update',
      {
        groupId: 'g1',
        kind: 'call',
      },
    );
    expect(realtime.toRoom).not.toHaveBeenCalled();
  });

  it('says when it ended', async () => {
    const { realtime, announce } = service();
    await announce(call({ group_id: 'g1' }), [], true);
    expect(realtime.toUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'call:ongoing_ended',
      { callId: 'c1', groupId: 'g1', channelId: null, seq: 0 },
    );
  });

  it("sends a channel's call to the channel's room only", async () => {
    const { realtime, announce } = service();
    await announce(call({ channel_id: 'ch1' }), [row('u9', 'joined')]);
    expect(realtime.toRoom).toHaveBeenCalledWith(
      'channel:ch1',
      'call:ongoing',
      {
        callId: 'c1',
        groupId: null,
        channelId: 'ch1',
        video: false,
        joined: 1,
        seq: 0,
      },
    );
    expect(realtime.toUsers).not.toHaveBeenCalled();
  });
});

describe('channel:watch', () => {
  const id = '11111111-2222-4333-8444-555555555555';

  function gateway(reader: 'admin' | 'subscriber' | null) {
    const prisma = {
      channelAdmin: {
        findUnique: jest
          .fn()
          .mockResolvedValue(reader === 'admin' ? { user_id: 'me' } : null),
      },
      channelSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            reader === 'subscriber' ? { user_id: 'me' } : null,
          ),
      },
    };
    const gw = Object.create(RealtimeGateway.prototype) as RealtimeGateway;
    Object.assign(gw, { prisma });
    const socket = {
      data: { user: { sub: 'me' }, viewing: new Set<string>() },
      join: jest.fn(),
      leave: jest.fn(),
    };
    return { gw, socket };
  }

  it('lets a subscriber hear the open channel', async () => {
    const { gw, socket } = gateway('subscriber');
    const r = await gw.watchChannel(socket as never, { channelId: id });
    expect(r).toEqual({ ok: true });
    expect(socket.join).toHaveBeenCalledWith(`channel:${id}`);
  });

  it('refuses someone who neither runs nor follows it', async () => {
    const { gw, socket } = gateway(null);
    const r = await gw.watchChannel(socket as never, { channelId: id });
    expect(r).toEqual({ ok: false });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('refuses a malformed id', async () => {
    const { gw, socket } = gateway('admin');
    expect(await gw.watchChannel(socket as never, { channelId: 'x' })).toEqual({
      ok: false,
    });
  });
});
