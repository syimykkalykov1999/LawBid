/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call, CallParticipant } from '@prisma/client';
import { CallsService } from './calls.service';

/**
 * Owner 2026-10-26 («I hang up and the call does not end»): POST
 * /calls/:id/end is idempotent — a retried or doubled hang-up ends and logs
 * the call once and tells the others once; a second «leave» changes
 * nothing. A group call down to one person with nobody ringing ends by
 * itself after the short grace (`calls.solo_end_seconds`, 3 s by default),
 * so the last one never stays in an empty call.
 */
type Row = Partial<CallParticipant> & { user_id: string; status: string };

function world(opts: {
  group: boolean;
  grace?: number;
  rows?: Row[];
  groupId?: string;
}) {
  const call = {
    id: 'c1',
    status: 'active',
    is_group: opts.group,
    caller_id: 'a',
    callee_id: 'b',
    conversation_id: null,
    group_id: opts.groupId ?? null,
    channel_id: null,
    answered_at: new Date(Date.now() - 60_000),
    solo_since: null as Date | null,
  } as unknown as Call;
  const rows: Row[] = opts.rows ?? [];
  const sent: { to: string; event: string }[] = [];
  const pushes: string[] = [];
  const prisma = {
    call: {
      findUnique: jest.fn(async () => ({ ...call })),
      findUniqueOrThrow: jest.fn(async () => ({ ...call })),
      updateMany: jest.fn(
        async (a: { where: Record<string, unknown>; data: Partial<Call> }) => {
          const w = a.where as {
            status?: { in: string[] } | string;
            solo_since?: unknown;
          };
          if (w.status && typeof w.status === 'object') {
            if (!w.status.in.includes(call.status)) return { count: 0 };
          } else if (typeof w.status === 'string' && w.status !== call.status) {
            return { count: 0 };
          }
          if (w.solo_since === null && call.solo_since) return { count: 0 };
          Object.assign(call, a.data);
          return { count: 1 };
        },
      ),
    },
    callParticipant: {
      findUnique: jest.fn(
        async (a: { where: { call_id_user_id: { user_id: string } } }) =>
          rows.find((r) => r.user_id === a.where.call_id_user_id.user_id) ??
          null,
      ),
      findMany: jest.fn(async () => rows),
      updateMany: jest.fn(
        async (a: {
          where: { id?: string; status?: string | { in: string[] } };
          data: Partial<CallParticipant>;
        }) => {
          let n = 0;
          for (const r of rows) {
            if (a.where.id && r.id !== a.where.id) continue;
            const st = a.where.status;
            if (typeof st === 'string' && r.status !== st) continue;
            if (st && typeof st === 'object' && !st.in.includes(r.status)) {
              continue;
            }
            Object.assign(r, a.data);
            n++;
          }
          return { count: n };
        },
      ),
    },
  };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    prisma,
    settings:
      opts.grace === undefined
        ? undefined
        : { number: jest.fn().mockResolvedValue(opts.grace) },
    realtime: {
      toUsers: (ids: string[], event: string) =>
        ids.forEach((to) => sent.push({ to, event })),
    },
    push: {
      enqueueCallEnded: async (p: { recipientId: string }) =>
        pushes.push(p.recipientId),
    },
    logger: { warn: jest.fn(), log: jest.fn() },
    slo: { count: jest.fn() },
    sfu: undefined,
    stopRingingPush: jest.fn(),
    endedActivePush: jest.fn(),
    stopInvitePushes: jest.fn(),
    logCall: jest.fn(),
    announceGroupCall: jest.fn(),
    broadcastParticipants: jest.fn(),
    armSoloTimer: jest.fn(),
    withSeq: async (_id: string, p: unknown) => p,
    toDto: async (c: Call) => ({ id: c.id, status: c.status }),
    audience: (c: Call, r: Row[]) =>
      c.is_group ? r.map((x) => x.user_id) : [c.caller_id, c.callee_id],
    hostFor: async () => 'a',
    isCallAdmin: async () => false,
  });
  return { svc, call, rows, sent, pushes };
}

const user = (sub: string) => ({ sub }) as never;

describe('POST /calls/:id/end is idempotent', () => {
  it('a 1:1 hang-up twice: ended and announced once', async () => {
    const w = world({ group: false });
    const first = await w.svc.end(user('a'), 'c1', {});
    const second = await w.svc.end(user('a'), 'c1', {});
    expect(first).toEqual({ id: 'c1', status: 'ended' });
    expect(second).toEqual({ id: 'c1', status: 'ended' });
    const ended = w.sent.filter((s) => s.event === 'call:ended');
    expect(ended.map((s) => s.to).sort()).toEqual(['a', 'b']);
  });

  it('both sides hang up at the same moment: still one end', async () => {
    const w = world({ group: false });
    await Promise.all([
      w.svc.end(user('a'), 'c1', {}),
      w.svc.end(user('b'), 'c1', {}),
    ]);
    expect(w.sent.filter((s) => s.event === 'call:ended')).toHaveLength(2);
  });

  it('a group member leaves twice: the second leave changes nothing', async () => {
    const w = world({
      group: true,
      grace: 3,
      rows: [
        { id: 'r1', user_id: 'a', status: 'joined' },
        { id: 'r2', user_id: 'b', status: 'joined' },
        { id: 'r3', user_id: 'c', status: 'joined' },
      ],
    });
    await w.svc.end(user('c'), 'c1', {});
    await w.svc.end(user('c'), 'c1', {});
    expect(w.rows.find((r) => r.user_id === 'c')?.status).toBe('left');
    expect(w.call.status).toBe('active');
    expect(w.pushes).toEqual(['c']);
  });

  it('a call of two (a 1:1 that only got an invite): ends the moment the other hangs up', async () => {
    const w = world({
      group: true,
      grace: 3,
      rows: [
        { id: 'r1', user_id: 'a', status: 'joined', joined_at: new Date() },
        { id: 'r2', user_id: 'b', status: 'joined', joined_at: new Date() },
        { id: 'r3', user_id: 'c', status: 'declined', joined_at: null },
      ],
    });
    await w.svc.end(user('b'), 'c1', {});
    // Owner 2026-10-26 (WhatsApp): no 3 s wait in a 1:1.
    expect(w.call.status).toBe('ended');
    expect(
      w.sent.filter((s) => s.event === 'call:ended').map((s) => s.to),
    ).toContain('a');
  });

  it('a group call down to one person: the 3 s grace, then the end', async () => {
    const w = world({
      group: true,
      grace: 3,
      groupId: 'grp',
      rows: [
        { id: 'r1', user_id: 'a', status: 'joined', joined_at: new Date() },
        { id: 'r2', user_id: 'b', status: 'joined', joined_at: new Date() },
      ],
    });
    await w.svc.end(user('b'), 'c1', {});
    expect(w.call.status).toBe('active');
    expect(w.call.solo_since).toBeInstanceOf(Date);
    expect(
      (w.svc as unknown as { armSoloTimer: jest.Mock }).armSoloTimer,
    ).toHaveBeenCalledWith('c1', 3000);
  });

  it('three people talked, two left: the grace too (it was a group call)', async () => {
    const w = world({
      group: true,
      grace: 3,
      rows: [
        { id: 'r1', user_id: 'a', status: 'joined', joined_at: new Date() },
        { id: 'r2', user_id: 'b', status: 'left', joined_at: new Date() },
        { id: 'r3', user_id: 'c', status: 'joined', joined_at: new Date() },
      ],
    });
    await w.svc.end(user('c'), 'c1', {});
    expect(w.call.status).toBe('active');
    expect(w.call.solo_since).toBeInstanceOf(Date);
  });

  it('with no grace the call ends at once and the last one hears it', async () => {
    const w = world({
      group: true,
      grace: 0,
      rows: [
        { id: 'r1', user_id: 'a', status: 'joined' },
        { id: 'r2', user_id: 'b', status: 'joined' },
      ],
    });
    await w.svc.end(user('b'), 'c1', {});
    expect(w.call.status).toBe('ended');
    expect(
      w.sent.filter((s) => s.event === 'call:ended').map((s) => s.to),
    ).toContain('a');
  });

  it('the host ends for everyone: one end, everyone told', async () => {
    const w = world({
      group: true,
      grace: 3,
      rows: [
        { id: 'r1', user_id: 'a', status: 'joined' },
        { id: 'r2', user_id: 'b', status: 'joined' },
        { id: 'r3', user_id: 'c', status: 'invited' },
      ],
    });
    await w.svc.end(user('a'), 'c1', { forAll: true });
    await w.svc.end(user('a'), 'c1', { forAll: true });
    expect(w.call.status).toBe('ended');
    expect(
      w.sent
        .filter((s) => s.event === 'call:ended')
        .map((s) => s.to)
        .sort(),
    ).toEqual(['a', 'b', 'c']);
    expect(w.rows.every((r) => r.status === 'left')).toBe(true);
  });

  /** LC-2 (audit 2026-10-26): a connected call whose link died is logged
   * as a call that took place — not «failed» with 0 s. */
  it('a connected 1:1 that lost its link: «ended» with its length, cause link_lost', async () => {
    const w = world({ group: false });
    await w.svc.end(user('a'), 'c1', { reason: 'failed' });
    const c = w.call as unknown as {
      status: string;
      duration_sec: number;
      end_reason: string;
    };
    expect(c.status).toBe('ended');
    expect(c.end_reason).toBe('link_lost');
    expect(c.duration_sec).toBeGreaterThanOrEqual(59);
  });

  it('a call that never got through stays «failed» with 0 s', async () => {
    const w = world({ group: false });
    Object.assign(w.call, { status: 'ringing', answered_at: null });
    await w.svc.end(user('a'), 'c1', { reason: 'failed' });
    const c = w.call as unknown as { status: string; duration_sec: number };
    expect(c.status).toBe('failed');
    expect(c.duration_sec).toBe(0);
  });

  /** LC-1: the phone that declined gets no VoIP «stop ringing» (it would
   * have to flash a CallKit call just to end it). */
  it('a declined ring stops the other phones, not the one that declined', async () => {
    const w = world({ group: false });
    Object.assign(w.call, { status: 'ringing', answered_at: null });
    await w.svc.decline({ sub: 'b', sid: 'chain-b' } as never, 'c1');
    const stop = (w.svc as unknown as { stopRingingPush: jest.Mock })
      .stopRingingPush;
    expect(stop).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      'chain-b',
    );
  });
});
