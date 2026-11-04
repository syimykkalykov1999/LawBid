/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { ForbiddenException } from '@nestjs/common';
import type { Call } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { CALLS_GROUP_FLAG, CallsService } from './calls.service';

/**
 * Owner 2026-11-04 (R-376): «пока что выруби групповые звонки, пусть будут
 * одиночные звонки». With the `calls_group` switch off the API refuses
 * starting a group / channel call, joining one and adding a participant
 * (so an old app build cannot make a call of three either); someone already
 * in a running call keeps it.
 */
const user = { sub: 'me' } as Parameters<CallsService['joinCall']>[0];

function world(on: boolean, opts: { joined?: boolean } = {}) {
  const call = {
    id: 'c1',
    status: 'active',
    is_group: false,
    group_id: null,
    channel_id: null,
    caller_id: 'me',
    callee_id: 'peer',
    video: false,
  } as unknown as Call;
  const groupCall = { ...call, is_group: true, group_id: 'g1' } as Call;
  const isEnabled = jest.fn(async (key: string, fallback: boolean) =>
    key === CALLS_GROUP_FLAG ? on : fallback,
  );
  const resolveInvitee = jest.fn(async () => null);
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    flags: { isEnabled },
    prisma: {
      call: {
        findUnique: jest.fn(async () => groupCall),
        findUniqueOrThrow: jest.fn(async () => groupCall),
      },
    },
    groups: {
      // A member without the «calls» right: past the switch, the rights
      // check answers.
      assertMember: jest.fn(async () => ({
        group: { who_can_call: 'admins' },
        can: () => false,
      })),
    },
    sweepIfDue: jest.fn(async () => undefined),
    assertChannelReader: jest.fn(async () => null),
    runningChannelCall: jest.fn(async () => null),
    load: jest.fn(async () => call),
    rowOf: jest.fn(async () => null),
    rowsOf: jest.fn(async () =>
      opts.joined ? [{ user_id: 'me', status: 'joined' }] : [],
    ),
    toDto: jest.fn(async () => ({ id: groupCall.id })),
    resolveInvitee,
  });
  return { svc, isEnabled, resolveInvitee };
}

async function codeOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ForbiddenException || e instanceof Error) {
      const body = (e as ForbiddenException).getResponse?.();
      return typeof body === 'object' && body !== null
        ? (body as { code?: unknown }).code
        : e.message;
    }
  }
  return 'resolved';
}

describe('calls_group switch off (R-376)', () => {
  it('the switch is read with «off» as the fallback', async () => {
    const w = world(false);
    await codeOf(w.svc.startGroupCall(user, 'g1'));
    expect(w.isEnabled).toHaveBeenCalledWith(CALLS_GROUP_FLAG, false);
  });

  it('refuses a call from a group chat', async () => {
    const w = world(false);
    expect(await codeOf(w.svc.startGroupCall(user, 'g1'))).toBe(
      ErrorCode.FEATURE_DISABLED,
    );
  });

  it('refuses a channel call', async () => {
    const w = world(false);
    expect(await codeOf(w.svc.startChannelCall(user, 'ch1'))).toBe(
      ErrorCode.FEATURE_DISABLED,
    );
  });

  it('refuses joining a running group call', async () => {
    const w = world(false);
    expect(await codeOf(w.svc.joinCall(user, 'c1'))).toBe(
      ErrorCode.FEATURE_DISABLED,
    );
  });

  it('someone already in the call keeps it', async () => {
    const w = world(false, { joined: true });
    expect(await codeOf(w.svc.joinCall(user, 'c1'))).toBe('resolved');
  });

  it('refuses adding a participant to a one-to-one call', async () => {
    const w = world(false);
    expect(await codeOf(w.svc.invite(user, 'c1', { userId: 'third' }))).toBe(
      ErrorCode.FEATURE_DISABLED,
    );
    expect(w.resolveInvitee).not.toHaveBeenCalled();
  });
});

describe('calls_group switch on', () => {
  it('a group chat call goes on to the usual rights check', async () => {
    const w = world(true);
    expect(await codeOf(w.svc.startGroupCall(user, 'g1'))).toBe(
      ErrorCode.GROUP_FORBIDDEN,
    );
  });

  it('adding a participant goes on to finding the person', async () => {
    const w = world(true);
    expect(await codeOf(w.svc.invite(user, 'c1', { userId: 'third' }))).toBe(
      ErrorCode.NOT_FOUND,
    );
    expect(w.resolveInvitee).toHaveBeenCalled();
  });
});
