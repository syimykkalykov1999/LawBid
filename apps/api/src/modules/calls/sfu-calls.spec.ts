/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call, CallParticipant } from '@prisma/client';
import { CallsService } from './calls.service';

/**
 * Owner 2026-10-24: the calls service side of Cloudflare SFU group calls:
 * who may use /calls/:id/sfu/*, what happens when someone leaves, is kicked
 * or the call ends, the audio-only downgrade in the fallback and the seats.
 */
type Svc = {
  sfuCtx(
    user: { sub: string },
    id: string,
  ): Promise<{
    callId: string;
    userId: string;
    canPublish: boolean;
    joinedUserIds: string[];
  }>;
  sfuPublish(user: { sub: string }, id: string, dto: unknown): Promise<unknown>;
  sfuSubscribe(
    user: { sub: string },
    id: string,
    dto: unknown,
  ): Promise<unknown>;
  sfuAnswer(user: { sub: string }, id: string, sdp: string): Promise<unknown>;
  sfuClose(user: { sub: string }, id: string, dto: unknown): Promise<unknown>;
  sfuLayer(user: { sub: string }, id: string, dto: unknown): Promise<unknown>;
  sfuSession(user: { sub: string }, id: string): Promise<unknown>;
  sfuRoster(call: Call, rows: CallParticipant[]): Promise<unknown>;
  downgradeFallbackVideo(call: Call, joined: number): Promise<Call>;
  capacity(video: boolean, mp?: 'p2p' | 'cloudflare'): Promise<number>;
  fallbackOf(call: Call, joined: number): Promise<unknown>;
  finish(call: Call, outcome: string, viewer: string | null): Promise<unknown>;
};

const row = (user_id: string, status: string) =>
  ({ user_id, status }) as CallParticipant;

function world(opts?: {
  call?: Partial<Call>;
  rows?: CallParticipant[];
  settings?: Record<string, string | number>;
  withSfu?: boolean;
}) {
  const call = {
    id: 'c1',
    status: 'active',
    is_group: true,
    video: true,
    media_provider: 'cloudflare',
    channel_id: null,
    ...opts?.call,
  } as Call;
  const rows = opts?.rows ?? [
    row('a', 'joined'),
    row('b', 'joined'),
    row('c', 'invited'),
    row('d', 'left'),
    row('e', 'removed'),
  ];
  const sfu = {
    createSession: jest.fn(async () => ({ sessionId: 's' })),
    publish: jest.fn(async () => ({ type: 'answer' })),
    subscribe: jest.fn(async () => ({ subscriptions: [] })),
    answer: jest.fn(async () => ({ ok: true })),
    close: jest.fn(async () => ({ closed: [] })),
    setLayer: jest.fn(async () => ({ ok: true })),
    reconcile: jest.fn(async () => undefined),
    readiness: jest.fn(async () => ({ tracksByUser: { a: ['mic'] } })),
    closeCall: jest.fn(async () => undefined),
  };
  const prisma = {
    call: {
      findUnique: jest.fn(async () => ({ ...call })),
      update: jest.fn(async (a: { data: Partial<Call> }) =>
        Object.assign(call, a.data),
      ),
    },
  };
  const settings = {
    string: jest.fn(async (k: string) => opts?.settings?.[k] ?? 'p2p'),
    number: jest.fn(async (k: string) => Number(opts?.settings?.[k] ?? 9)),
  };
  const svc = Object.create(CallsService.prototype) as CallsService;
  const broadcast = jest.fn(async () => undefined);
  Object.assign(svc, {
    prisma,
    sfu: opts?.withSfu === false ? undefined : sfu,
    settings,
    rowsOf: async () => rows,
    isCallAdmin: jest.fn(async (_c: Call, u: string) => u === 'a'),
    broadcastParticipants: broadcast,
    logger: { warn: jest.fn() },
    activeVideoProvider: async () => ({ name: 'webrtc' }),
  });
  return { svc: svc as unknown as Svc, call, rows, sfu, prisma, broadcast };
}

describe('SFU routes: who may use them', () => {
  it('a joined person gets in; the roster comes from our rows', async () => {
    const w = world();
    const ctx = await w.svc.sfuCtx({ sub: 'b' }, 'c1');
    expect(ctx).toEqual({
      callId: 'c1',
      userId: 'b',
      canPublish: true,
      joinedUserIds: ['a', 'b'],
    });
  });

  it.each([
    ['not in the call', 'zzz'],
    ['only invited', 'c'],
    ['left', 'd'],
    ['removed by the host', 'e'],
  ])('%s: 404 on every route, the broker is never reached', async (_n, u) => {
    const w = world();
    const user = { sub: u };
    const calls: Array<() => Promise<unknown>> = [
      () => w.svc.sfuSession(user, 'c1'),
      () => w.svc.sfuPublish(user, 'c1', {}),
      () => w.svc.sfuSubscribe(user, 'c1', {}),
      () => w.svc.sfuAnswer(user, 'c1', 'v=0'),
      () => w.svc.sfuClose(user, 'c1', {}),
      () => w.svc.sfuLayer(user, 'c1', {}),
    ];
    for (const c of calls)
      await expect(c()).rejects.toMatchObject({ status: 404 });
    for (const fn of Object.values(w.sfu)) expect(fn).not.toHaveBeenCalled();
  });

  it('a one-to-one call, an ended call and a device-to-device call are refused', async () => {
    await expect(
      world({ call: { is_group: false } }).svc.sfuCtx({ sub: 'a' }, 'c1'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      world({ call: { status: 'ended' } }).svc.sfuCtx({ sub: 'a' }, 'c1'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      world({ call: { media_provider: 'p2p' } }).svc.sfuCtx({ sub: 'a' }, 'c1'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('a missing call is 404, and without the broker everything is 404', async () => {
    const w = world();
    (w.prisma.call.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(w.svc.sfuCtx({ sub: 'a' }, 'nope')).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      world({ withSfu: false }).svc.sfuCtx({ sub: 'a' }, 'c1'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a channel call: only admins publish, listeners may still pull', async () => {
    const w = world({
      call: { channel_id: 'ch' },
      rows: [row('a', 'joined'), row('b', 'joined')],
    });
    expect((await w.svc.sfuCtx({ sub: 'a' }, 'c1')).canPublish).toBe(true);
    expect((await w.svc.sfuCtx({ sub: 'b' }, 'c1')).canPublish).toBe(false);
  });

  it('publishing tells the call (participants event) so phones pull', async () => {
    const w = world();
    await w.svc.sfuPublish({ sub: 'a' }, 'c1', { sdp: 'v=0', tracks: [] });
    expect(w.sfu.publish).toHaveBeenCalledTimes(1);
    expect(w.broadcast).toHaveBeenCalledWith('c1');
    // pulling does not.
    w.broadcast.mockClear();
    await w.svc.sfuSubscribe({ sub: 'a' }, 'c1', {});
    expect(w.broadcast).not.toHaveBeenCalled();
  });
});

describe('SFU cleanup hooks', () => {
  it('the roster broadcast cleans up everyone who is not joined', async () => {
    const w = world();
    const roster = await w.svc.sfuRoster(w.call, w.rows);
    expect(w.sfu.reconcile).toHaveBeenCalledWith('c1', ['a', 'b']);
    expect(roster).toEqual({ a: ['mic'] });
  });

  it('a device-to-device call never touches the SFU state', async () => {
    const w = world({ call: { media_provider: 'p2p' } });
    expect(await w.svc.sfuRoster(w.call, w.rows)).toBeNull();
    expect(w.sfu.reconcile).not.toHaveBeenCalled();
  });

  it('a Redis/Cloudflare error in cleanup does not break the broadcast', async () => {
    const w = world();
    w.sfu.reconcile.mockRejectedValueOnce(new Error('redis down'));
    await expect(w.svc.sfuRoster(w.call, w.rows)).resolves.toEqual({});
  });

  it('finish closes every session of a Cloudflare call, once', async () => {
    const w = world();
    const noop = jest.fn(async () => undefined);
    Object.assign(w.prisma.call, {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ ...w.call, status: 'ended' })),
    });
    Object.assign(w.svc, {
      prisma: {
        ...w.prisma,
        callParticipant: { updateMany: noop },
      },
      stopRingingPush: noop,
      endedActivePush: noop,
      stopInvitePushes: noop,
      logCall: noop,
      announceGroupCall: noop,
      audience: () => [],
      withSeq: async (_id: string, p: object) => p,
      toDto: async () => ({}),
      realtime: { toUsers: jest.fn() },
      notifications: { emit: noop },
    });
    await w.svc.finish(w.call, 'ended', null);
    expect(w.sfu.closeCall).toHaveBeenCalledWith('c1');
    expect(w.sfu.closeCall).toHaveBeenCalledTimes(1);
  });

  it('finish of a device-to-device call does not call the SFU', async () => {
    const w = world({ call: { media_provider: 'p2p' } });
    const noop = jest.fn(async () => undefined);
    Object.assign(w.svc, {
      prisma: {
        call: {
          updateMany: jest.fn(async () => ({ count: 1 })),
          findUniqueOrThrow: jest.fn(async () => ({ ...w.call })),
        },
        callParticipant: { updateMany: noop },
      },
      stopRingingPush: noop,
      endedActivePush: noop,
      stopInvitePushes: noop,
      logCall: noop,
      announceGroupCall: noop,
      audience: () => [],
      withSeq: async (_id: string, p: object) => p,
      toDto: async () => ({}),
      realtime: { toUsers: jest.fn() },
      notifications: { emit: noop },
    });
    await w.svc.finish(w.call, 'ended', null);
    expect(w.sfu.closeCall).not.toHaveBeenCalled();
  });
});

describe('fallback: audio-only when too many people (owner 2026-10-24)', () => {
  const S = {
    'calls.video_provider': 'cloudflare',
    'calls.sfu_fallback_mesh_max': 4,
    'calls.sfu_max_participants': 20,
  };

  it('a fallback video call with 5 people becomes audio for everyone', async () => {
    const w = world({ call: { media_provider: 'p2p' }, settings: S });
    const out = await w.svc.downgradeFallbackVideo(w.call, 5);
    expect(out.video).toBe(false);
    expect(w.prisma.call.update).toHaveBeenCalledTimes(1);
  });

  it('4 people keep video; the SFU, audio calls and plain p2p are untouched', async () => {
    const small = world({ call: { media_provider: 'p2p' }, settings: S });
    expect((await small.svc.downgradeFallbackVideo(small.call, 4)).video).toBe(
      true,
    );
    const sfu = world({ settings: S });
    expect((await sfu.svc.downgradeFallbackVideo(sfu.call, 15)).video).toBe(
      true,
    );
    const audio = world({
      call: { media_provider: 'p2p', video: false },
      settings: S,
    });
    await audio.svc.downgradeFallbackVideo(audio.call, 9);
    expect(audio.prisma.call.update).not.toHaveBeenCalled();
    const plain = world({
      call: { media_provider: 'p2p' },
      settings: { 'calls.video_provider': 'p2p' },
    });
    expect((await plain.svc.downgradeFallbackVideo(plain.call, 9)).video).toBe(
      true,
    );
  });

  it('seats: SFU and fallback both get the SFU limit (20), plain p2p keeps 9', async () => {
    const w = world({ settings: S });
    expect(await w.svc.capacity(true, 'cloudflare')).toBe(20);
    expect(await w.svc.capacity(true, 'p2p')).toBe(20);
    expect(await w.svc.capacity(false, 'p2p')).toBe(20);
    const plain = world({ settings: { 'calls.video_provider': 'p2p' } });
    expect(await plain.svc.capacity(true, 'p2p')).toBe(9);
  });
});

describe('mediaFallback flag for the app', () => {
  const S = {
    'calls.video_provider': 'cloudflare',
    'calls.sfu_fallback_mesh_max': 4,
  };
  it('active + videoBlocked above the threshold, active but not blocked at 4', async () => {
    const w = world({ call: { media_provider: 'p2p' }, settings: S });
    expect(await w.svc.fallbackOf(w.call, 5)).toEqual({
      active: true,
      reason: 'sfu_unavailable',
      videoBlocked: true,
      videoMaxParticipants: 4,
    });
    expect(await w.svc.fallbackOf(w.call, 4)).toMatchObject({
      active: true,
      videoBlocked: false,
    });
  });
  it('not active on the SFU, and absent for 1:1 calls', async () => {
    const sfu = world({ settings: S });
    expect(await sfu.svc.fallbackOf(sfu.call, 15)).toMatchObject({
      active: false,
      reason: null,
      videoBlocked: false,
    });
    const one = world({ call: { is_group: false }, settings: S });
    expect(await one.svc.fallbackOf(one.call, 2)).toBeUndefined();
  });
});
