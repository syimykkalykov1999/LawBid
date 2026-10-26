import type { Socket } from 'socket.io';
import { RealtimeGateway } from './realtime.gateway';

/** S1-12 / S1-7: the typing cap for big rooms and the call-signal lookup. */
describe('RealtimeGateway typing cap (big rooms)', () => {
  function make(roomSize: number, bigAt: number, maxTypers = 3) {
    const gw = Object.create(RealtimeGateway.prototype) as Record<
      string,
      unknown
    >;
    gw.timing = {
      typingBigRoomSockets: bigAt,
      typingBigRoomMaxTypers: maxTypers,
    };
    gw.recentTypers = new Map();
    gw.nsp = {
      adapter: { rooms: new Map([['conversation:c1', { size: roomSize }]]) },
    };
    return (user: string, now: number) =>
      (
        gw as unknown as {
          typingAllowed: (c: string, u: string, n: number) => boolean;
        }
      ).typingAllowed('c1', user, now);
  }

  it('off (0): everybody is forwarded', () => {
    const allowed = make(500, 0);
    expect(['a', 'b', 'c', 'd', 'e'].every((u) => allowed(u, 1000))).toBe(true);
  });

  it('small rooms are never limited', () => {
    const allowed = make(10, 50);
    expect(['a', 'b', 'c', 'd', 'e'].every((u) => allowed(u, 1000))).toBe(true);
  });

  it('big room: only 3 distinct typers per 5 s, a typer keeps going', () => {
    const allowed = make(500, 50);
    expect(allowed('a', 1000)).toBe(true);
    expect(allowed('b', 1100)).toBe(true);
    expect(allowed('c', 1200)).toBe(true);
    expect(allowed('d', 1300)).toBe(false);
    expect(allowed('a', 2000)).toBe(true);
    // after the window the others are free again
    expect(allowed('d', 7000)).toBe(true);
  });
});

describe('RealtimeGateway call:signal', () => {
  it('looks the call up once per 30 s per socket (not per ICE candidate)', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      caller_id: 'u1',
      callee_id: 'u2',
      status: 'active',
      is_group: false,
      participants: [],
    });
    const emit = jest.fn();
    const gw = Object.create(RealtimeGateway.prototype) as Record<
      string,
      unknown
    >;
    gw.prisma = { call: { findUnique } };
    gw.nsp = { to: jest.fn(() => ({ emit })) };
    const socket = { data: { user: { sub: 'u1' } } } as unknown as Socket;
    const callId = '11111111-1111-4111-8111-111111111111';
    const send = () =>
      (
        gw as unknown as {
          callSignal: (s: Socket, b: unknown) => Promise<{ ok: boolean }>;
        }
      ).callSignal(socket, { callId, data: { candidate: 'x' } });
    expect((await send()).ok).toBe(true);
    expect((await send()).ok).toBe(true);
    expect((await send()).ok).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(3);
  });
});
