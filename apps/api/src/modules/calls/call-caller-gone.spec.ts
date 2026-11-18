/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call } from '../../generated/prisma/client';
import { CallsService } from './calls.service';

/**
 * Verify 5b (17.11).
 * C1: the caller closed the app while a 1:1 call rang — the
 * `calls.caller-gone` job cancels the ring (once) unless the caller is back
 * on any instance.
 * C2: a hang-up decided from a stale «ringing» read must not turn a call
 * answered in between into «canceled»; the sweep likewise.
 */
function world(opts: { status?: string; live?: number } = {}) {
  const call = {
    id: 'c1',
    status: opts.status ?? 'ringing',
    is_group: false,
    caller_id: 'a',
    callee_id: 'b',
    conversation_id: 'conv1',
    group_id: null,
    channel_id: null,
    answered_at: null as Date | null,
    created_at: new Date(Date.now() - 90_000),
    end_reason: null as string | null,
  } as unknown as Call;
  /** Runs right before the first status-guarded update (the race). */
  let beforeUpdate: (() => void) | undefined;
  const sent: { to: string; event: string }[] = [];
  const notices: unknown[] = [];
  const prisma = {
    call: {
      findUnique: jest.fn(async () => ({ ...call })),
      findUniqueOrThrow: jest.fn(async () => ({ ...call })),
      findMany: jest.fn(async () => [{ ...call }]),
      updateMany: jest.fn(
        async (a: { where: { status?: { in: string[] } }; data: object }) => {
          // the end-effects marker clear has no status guard
          if (!a.where.status) return { count: 1 };
          const hook = beforeUpdate;
          beforeUpdate = undefined;
          hook?.();
          if (!a.where.status.in.includes(call.status)) return { count: 0 };
          Object.assign(call, a.data);
          return { count: 1 };
        },
      ),
    },
    callParticipant: { findMany: jest.fn(async () => []) },
  };
  const redis = { zcount: jest.fn(async () => opts.live ?? 0) };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    prisma,
    redis,
    realtime: {
      toUsers: (ids: string[], event: string) =>
        ids.forEach((to) => sent.push({ to, event })),
    },
    notifications: { emit: async (n: unknown) => notices.push(n) },
    logger: { warn: jest.fn(), log: jest.fn() },
    slo: { count: jest.fn() },
    sfu: undefined,
    stopRingingPush: jest.fn(),
    endedActivePush: jest.fn(),
    stopInvitePushes: jest.fn(),
    logCall: jest.fn(),
    announceGroupCall: jest.fn(),
    sweepInvites: jest.fn(),
    sweepSilentMembers: jest.fn(),
    sweepSoloCalls: jest.fn(),
    sweepEmptyCalls: jest.fn(),
    sweepVotes: jest.fn(),
    withSeq: async (_id: string, p: unknown) => p,
    toDto: async (c: Call) => ({ id: c.id, status: c.status }),
    audience: (c: Call) => [c.caller_id, c.callee_id],
  });
  return {
    svc,
    call,
    sent,
    notices,
    redis,
    race: (fn: () => void) => {
      beforeUpdate = fn;
    },
  };
}

const user = (sub: string) => ({ sub, sid: `s-${sub}` }) as never;
const answer = (call: Call) => () =>
  Object.assign(call, { status: 'active', answered_at: new Date() });

describe('C1: caller gone while ringing (calls.caller-gone)', () => {
  it('ringing, caller has no live connection: canceled once, ring stopped', async () => {
    const w = world();
    expect(await w.svc.endIfCallerGone('c1')).toEqual({ ended: true });
    expect(w.call.status).toBe('canceled');
    expect((w.call as unknown as { end_reason: string }).end_reason).toBe(
      'caller_gone',
    );
    expect(w.redis.zcount).toHaveBeenCalledWith(
      'presence:a',
      expect.any(Number),
      '+inf',
    );
    expect(
      w.sent.filter((s) => s.event === 'call:ended').map((s) => s.to),
    ).toEqual(['a', 'b']);
    expect(w.notices).toHaveLength(1);
    // a duplicate job (another instance) changes nothing
    expect(await w.svc.endIfCallerGone('c1')).toEqual({
      ended: false,
      reason: 'not ringing',
    });
    expect(w.notices).toHaveLength(1);
  });

  it('the caller came back on any instance: the call keeps ringing', async () => {
    const w = world({ live: 1 });
    expect(await w.svc.endIfCallerGone('c1')).toEqual({
      ended: false,
      reason: 'caller back',
    });
    expect(w.call.status).toBe('ringing');
    expect(w.sent).toHaveLength(0);
  });

  it('answered meanwhile: not touched', async () => {
    const w = world({ status: 'active' });
    expect((await w.svc.endIfCallerGone('c1')).ended).toBe(false);
    expect(w.call.status).toBe('active');
  });

  it('answered between the read and the cancel: stays active', async () => {
    const w = world();
    w.race(answer(w.call));
    expect((await w.svc.endIfCallerGone('c1')).ended).toBe(false);
    expect(w.call.status).toBe('active');
  });
});

describe('C2: an end decided from a stale read', () => {
  it('caller hangs up while the callee accepts: a normal end, not canceled', async () => {
    const w = world();
    w.race(answer(w.call));
    const res = await w.svc.end(user('a'), 'c1', {});
    expect(res.status).toBe('ended');
    expect(w.call.status).toBe('ended');
    // no missed-call notice for a call that was answered
    expect(w.notices).toHaveLength(0);
  });

  it('the sweep does not mark a ring answered since its read as missed', async () => {
    const w = world();
    w.race(answer(w.call));
    await w.svc.sweep();
    expect(w.call.status).toBe('active');
    expect(w.notices).toHaveLength(0);
  });
});
