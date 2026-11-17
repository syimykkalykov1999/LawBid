/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call } from '../../generated/prisma/client';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CallsService } from './calls.service';

/**
 * Row 216 (owner 17.11, WhatsApp call waiting): a person talking in one
 * 1:1 call may be rung for a second 1:1 call instead of an instant «busy»;
 * never during a ring, a group call, a second waiting call, or with the
 * admin switch `calls.call_waiting` off. Answering the waiting call ends
 * the call they were in.
 */
type Live = { status: string; is_group: boolean };

function service(live: Live[], waitingOn: boolean | undefined = true) {
  const finished: string[] = [];
  const prisma = {
    call: {
      findMany: jest.fn(async (a: { where: { id?: unknown } }) =>
        a.where.id
          ? [{ id: 'first', status: 'active', is_group: false } as Call]
          : live,
      ),
    },
  };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    prisma,
    settings:
      waitingOn === undefined
        ? undefined
        : {
            boolean: async (k: string) =>
              k === 'calls.call_waiting' ? waitingOn : false,
          },
    finish: jest.fn(async (c: Call) => {
      finished.push(c.id);
      return { id: c.id };
    }),
  });
  const s = svc as unknown as {
    mayWait(userId: string): Promise<boolean>;
    endOtherCallsOf(user: RequestUser, keepId: string): Promise<void>;
  };
  return { s, prisma, finished };
}

describe('call waiting (row 216)', () => {
  it('rings a callee talking in one 1:1 call', async () => {
    const { s } = service([{ status: 'active', is_group: false }]);
    expect(await s.mayWait('callee')).toBe(true);
  });

  it('busy while the callee only rings or dials out', async () => {
    const { s } = service([{ status: 'ringing', is_group: false }]);
    expect(await s.mayWait('callee')).toBe(false);
  });

  it('busy when a second call already waits', async () => {
    const { s } = service([
      { status: 'active', is_group: false },
      { status: 'ringing', is_group: false },
    ]);
    expect(await s.mayWait('callee')).toBe(false);
  });

  it('busy in a group call (group calls unchanged)', async () => {
    const { s } = service([{ status: 'active', is_group: true }]);
    expect(await s.mayWait('callee')).toBe(false);
  });

  it('busy when the admin switch is off', async () => {
    const { s, prisma } = service(
      [{ status: 'active', is_group: false }],
      false,
    );
    expect(await s.mayWait('callee')).toBe(false);
    expect(prisma.call.findMany).not.toHaveBeenCalled();
  });

  it('on by default (no settings service)', async () => {
    const { s } = service([{ status: 'active', is_group: false }], undefined);
    expect(await s.mayWait('callee')).toBe(true);
  });

  it('answering the waiting call ends the 1:1 call they were in', async () => {
    const { s, prisma, finished } = service([]);
    await s.endOtherCallsOf(
      { sub: 'callee', sid: 'sid-1' } as RequestUser,
      'second',
    );
    expect(finished).toEqual(['first']);
    expect(prisma.call.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { not: 'second' },
        is_group: false,
        status: 'active',
      }) as unknown,
    });
  });
});
