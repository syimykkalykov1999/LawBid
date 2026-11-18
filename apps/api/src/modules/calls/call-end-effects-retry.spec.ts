/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call } from '../../generated/prisma/client';
import { CallsService } from './calls.service';

/**
 * Verify 5b (17.11): the end of a call and its effects were not atomic —
 * a throw after the status change (the chat entry, logCall) lost call:ended,
 * the stop-ringing push and the missed-call notice, and a retry saw the
 * call as final and did nothing. Now `ended_events_due_at` is written with
 * the final status and cleared after the effects; the sweep re-sends an
 * overdue one exactly once.
 */
type Where = {
  id?: string;
  status?: { in: string[] };
  ended_events_due_at?: Date | { not: null; lt: Date } | null;
};

function world() {
  const call = {
    id: 'c1',
    status: 'ringing',
    is_group: false,
    caller_id: 'a',
    callee_id: 'b',
    conversation_id: 'conv1',
    group_id: null,
    channel_id: null,
    answered_at: null as Date | null,
    ended_at: null as Date | null,
    created_at: new Date(Date.now() - 10_000),
    end_reason: null as string | null,
    ended_events_due_at: null as Date | null,
  } as unknown as Call & { ended_events_due_at: Date | null };
  const sent: { to: string; event: string }[] = [];
  const notices: unknown[] = [];
  const matches = (w: Where) => {
    if (w.id && w.id !== call.id) return false;
    if (w.status && !w.status.in.includes(call.status)) return false;
    const due = w.ended_events_due_at;
    if (due instanceof Date) {
      return call.ended_events_due_at?.getTime() === due.getTime();
    }
    if (due && 'lt' in due) {
      return (
        call.ended_events_due_at !== null &&
        call.ended_events_due_at.getTime() < due.lt.getTime()
      );
    }
    return true;
  };
  const prisma = {
    call: {
      findUniqueOrThrow: jest.fn(async () => ({ ...call })),
      findMany: jest.fn(async (a: { where: Where & { OR?: unknown } }) =>
        a.where.OR ? [] : matches(a.where) ? [{ ...call }] : [],
      ),
      updateMany: jest.fn(async (a: { where: Where; data: object }) => {
        if (!matches(a.where)) return { count: 0 };
        Object.assign(call, a.data);
        return { count: 1 };
      }),
    },
    callParticipant: { findMany: jest.fn(async () => []) },
  };
  const logCall = jest
    .fn()
    .mockRejectedValueOnce(new Error('db hiccup'))
    .mockResolvedValue(undefined);
  const stopRingingPush = jest.fn(async () => undefined);
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    prisma,
    redis: undefined,
    realtime: {
      toUsers: (ids: string[], event: string) =>
        ids.forEach((to) => sent.push({ to, event })),
    },
    notifications: { emit: async (n: unknown) => notices.push(n) },
    logger: { warn: jest.fn(), log: jest.fn() },
    slo: { count: jest.fn() },
    sfu: undefined,
    stopRingingPush,
    endedActivePush: jest.fn(),
    stopInvitePushes: jest.fn(),
    logCall,
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
  const finish = (
    svc as unknown as {
      finish: (c: Call, o: string, v: string | null) => Promise<unknown>;
    }
  ).finish.bind(svc);
  return { svc, call, sent, notices, logCall, stopRingingPush, finish };
}

describe('call end effects survive a throw (verify 5b)', () => {
  it('logCall throws once: the end stands, the sweep sends every effect exactly once', async () => {
    const w = world();
    const start = { ...w.call };
    // the hang-up itself succeeds — the call is over
    await expect(w.finish(start, 'canceled', 'a')).resolves.toEqual({
      id: 'c1',
      status: 'canceled',
    });
    expect(w.call.status).toBe('canceled');
    // nothing went out yet, and the marker says so
    expect(w.sent).toHaveLength(0);
    expect(w.stopRingingPush).not.toHaveBeenCalled();
    expect(w.notices).toHaveLength(0);
    expect(w.call.ended_events_due_at).toBeInstanceOf(Date);

    // inside the retry window the sweep leaves it to the first try
    await w.svc.sweep(new Date());
    expect(w.sent).toHaveLength(0);

    // overdue: re-sent once
    await w.svc.sweep(new Date(Date.now() + 61_000));
    expect(w.logCall).toHaveBeenCalledTimes(2);
    expect(w.stopRingingPush).toHaveBeenCalledTimes(1);
    expect(
      w.sent.filter((s) => s.event === 'call:ended').map((s) => s.to),
    ).toEqual(['a', 'b']);
    expect(w.notices).toHaveLength(1);
    expect(w.call.ended_events_due_at).toBeNull();

    // later sweeps (and a repeated hang-up) send nothing more
    await w.svc.sweep(new Date(Date.now() + 300_000));
    await w.finish(start, 'canceled', 'a');
    expect(w.stopRingingPush).toHaveBeenCalledTimes(1);
    expect(w.sent.filter((s) => s.event === 'call:ended')).toHaveLength(2);
    expect(w.notices).toHaveLength(1);
  });

  it('no throw: effects once, the marker cleared at once', async () => {
    const w = world();
    w.logCall.mockReset().mockResolvedValue(undefined);
    await w.finish({ ...w.call }, 'canceled', 'a');
    expect(w.stopRingingPush).toHaveBeenCalledTimes(1);
    expect(w.sent.filter((s) => s.event === 'call:ended')).toHaveLength(2);
    expect(w.call.ended_events_due_at).toBeNull();
    await w.svc.sweep(new Date(Date.now() + 61_000));
    expect(w.stopRingingPush).toHaveBeenCalledTimes(1);
  });
});
