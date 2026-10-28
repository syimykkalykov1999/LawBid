/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { callPollKey, signCallPoll } from '../../common/calls/call-poll-token';
import { CALL_RING_TIMEOUT_MS, CallsService } from './calls.service';

/**
 * Owner 2026-10-28 (a locked Samsung kept ringing after the iPhone caller
 * hung up before it was answered): the caller's cancel sends the callee
 * the «stop ringing» push (FCM data, high priority; VoIP on iPhones), and
 * the ringing phone can ask `GET /calls/:id/status?t=<ticket>` without a
 * session — only with the ring push's own short-lived ticket.
 */
const PEPPER = 'test-call-poll-pepper-at-least-32-chars-x';

function world(status: 'ringing' | 'active' = 'ringing', ageMs = 5_000) {
  const call = {
    id: 'c1',
    status,
    is_group: false,
    caller_id: 'caller',
    callee_id: 'callee',
    conversation_id: 'conv1',
    group_id: null,
    channel_id: null,
    answered_at: status === 'active' ? new Date() : null,
    created_at: new Date(Date.now() - ageMs),
  } as unknown as Call;
  const ends: { recipientId: string; callId: string; ended?: boolean }[] = [];
  const prisma = {
    call: {
      findUnique: jest.fn(async () => ({ ...call })),
      findUniqueOrThrow: jest.fn(async () => ({ ...call })),
      updateMany: jest.fn(
        async (a: {
          where: { status?: { in: string[] } };
          data: Partial<Call>;
        }) => {
          if (a.where.status && !a.where.status.in.includes(call.status)) {
            return { count: 0 };
          }
          Object.assign(call, a.data);
          return { count: 1 };
        },
      ),
    },
    callParticipant: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    prisma,
    config: {
      get: (k: string) => (k === 'AUTH_EVENT_PEPPER' ? PEPPER : undefined),
    },
    realtime: { toUsers: jest.fn(), toRoom: jest.fn() },
    push: {
      enqueueCallEnded: async (p: {
        recipientId: string;
        callId: string;
        ended?: boolean;
      }) => {
        ends.push(p);
      },
    },
    notifications: { emit: jest.fn() },
    logger: { warn: jest.fn(), log: jest.fn() },
    slo: { count: jest.fn() },
    sfu: undefined,
    callAssistants: async () => [],
    logCall: jest.fn(),
    announceGroupCall: jest.fn(),
    broadcastParticipants: jest.fn(),
    armSoloTimer: jest.fn(),
    withSeq: async (_id: string, p: unknown) => p,
    toDto: async (c: Call) => ({ id: c.id, status: c.status }),
    audience: (c: Call) => [c.caller_id, c.callee_id],
    hostFor: async () => 'caller',
    isCallAdmin: async () => false,
  });
  return { svc, call, ends };
}

const user = (sub: string) => ({ sub }) as never;
const ticket = (callId = 'c1', nowMs = Date.now()) =>
  signCallPoll(callPollKey(PEPPER), { c: callId, u: 'callee' }, nowMs);

describe('caller cancels before the answer', () => {
  it('sends the callee the «stop ringing» push (not «the call is over»)', async () => {
    const w = world('ringing');
    const out = await w.svc.end(user('caller'), 'c1', {});
    expect(out).toEqual({ id: 'c1', status: 'canceled' });
    expect(w.ends).toEqual([{ recipientId: 'callee', callId: 'c1' }]);
  });

  it('a second cancel sends nothing more', async () => {
    const w = world('ringing');
    await w.svc.end(user('caller'), 'c1', {});
    await w.svc.end(user('caller'), 'c1', {});
    expect(w.ends).toHaveLength(1);
  });
});

describe('GET /calls/:id/status?t=', () => {
  it('a valid ticket: ringing, then ended after the cancel', async () => {
    const w = world('ringing');
    await expect(w.svc.ringStatus('c1', ticket())).resolves.toEqual({
      state: 'ringing',
    });
    await w.svc.end(user('caller'), 'c1', {});
    await expect(w.svc.ringStatus('c1', ticket())).resolves.toEqual({
      state: 'ended',
    });
  });

  it('answered (here or on another device): active', async () => {
    const w = world('active');
    await expect(w.svc.ringStatus('c1', ticket())).resolves.toEqual({
      state: 'active',
    });
  });

  it('a ring past the server timeout counts as over', async () => {
    const w = world('ringing', CALL_RING_TIMEOUT_MS + 1_000);
    await expect(w.svc.ringStatus('c1', ticket())).resolves.toEqual({
      state: 'ended',
    });
  });

  it('an expired ticket is refused', async () => {
    const w = world('ringing');
    const old = ticket('c1', Date.now() - 10 * 60_000);
    await expect(w.svc.ringStatus('c1', old)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('a ticket of another call is refused (no peeking at other calls)', async () => {
    const w = world('ringing');
    await expect(w.svc.ringStatus('c1', ticket('c2'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(w.ends).toHaveLength(0);
  });

  it('garbage is refused', async () => {
    const w = world('ringing');
    await expect(w.svc.ringStatus('c1', 'nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
