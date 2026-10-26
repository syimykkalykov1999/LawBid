/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import type { Call, CallParticipant } from '@prisma/client';
import { CallsService } from './calls.service';

/**
 * Owner 2026-10-23: a call with one person left ends after
 * `calls.solo_end_seconds`; someone joining within it keeps the call; two
 * instances / the cron never end it twice.
 */
type Svc = {
  settleHeadcount(call: Call, viewer: string | null): Promise<unknown>;
  endSolo(id: string): Promise<boolean>;
  sweepSoloCalls(now: Date): Promise<void>;
  sweepEmptyCalls(now: Date): Promise<void>;
  soloGraceMs(): Promise<number>;
};

function world(graceSec: number | undefined) {
  const call = {
    id: 'c1',
    status: 'active',
    solo_since: null as Date | null,
    is_group: true,
  } as Call;
  let rows: Partial<CallParticipant>[] = [
    { user_id: 'a', status: 'joined' },
    { user_id: 'b', status: 'joined' },
  ];
  const finish = jest.fn(async () => {
    call.status = 'ended';
  });
  const prisma = {
    call: {
      findUnique: jest.fn(async () => ({ ...call })),
      findMany: jest.fn(async () => (call.solo_since ? [{ ...call }] : [])),
      updateMany: jest.fn(
        async (a: { where: Record<string, unknown>; data: Partial<Call> }) => {
          if ('solo_since' in a.where && a.where.solo_since === null) {
            if (call.solo_since) return { count: 0 };
          }
          if (
            'solo_since' in a.where &&
            typeof a.where.solo_since === 'object' &&
            a.where.solo_since !== null &&
            'not' in a.where.solo_since &&
            !call.solo_since
          ) {
            return { count: 0 };
          }
          Object.assign(call, a.data);
          return { count: 1 };
        },
      ),
    },
  };
  const svc = Object.create(CallsService.prototype) as CallsService;
  Object.assign(svc, {
    prisma,
    settings:
      graceSec === undefined
        ? undefined
        : { number: jest.fn().mockResolvedValue(graceSec) },
    rowsOf: async () => rows,
    // The in-process nudge is only a convenience; the tests drive endSolo.
    armSoloTimer: jest.fn(),
    finish,
  });
  return {
    svc: svc as unknown as Svc,
    call,
    finish,
    setRows: (r: Partial<CallParticipant>[]) => (rows = r),
  };
}

describe('a call with one person left', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps going while two are connected', async () => {
    const w = world(30);
    await w.svc.settleHeadcount(w.call, 'a');
    expect(w.finish).not.toHaveBeenCalled();
    expect(w.call.solo_since).toBeNull();
  });

  it('starts the grace when one is left, ends after it', async () => {
    const w = world(30);
    w.setRows([
      { user_id: 'a', status: 'joined' },
      { user_id: 'b', status: 'left' },
    ]);
    await w.svc.settleHeadcount(w.call, 'b');
    expect(w.call.solo_since).toBeInstanceOf(Date);
    expect(w.finish).not.toHaveBeenCalled();
    expect(await w.svc.endSolo('c1')).toBe(false);
    jest.advanceTimersByTime(31_000);
    expect(await w.svc.endSolo('c1')).toBe(true);
    expect(w.finish).toHaveBeenCalledTimes(1);
    // The duration is until the second to last person left.
    expect((w.finish.mock.calls[0] as unknown[])[3]).toBe(w.call.solo_since);
  });

  it('keeps the call when somebody comes back within the grace', async () => {
    const w = world(30);
    w.setRows([
      { user_id: 'a', status: 'joined' },
      { user_id: 'b', status: 'left' },
    ]);
    await w.svc.settleHeadcount(w.call, 'b');
    w.setRows([
      { user_id: 'a', status: 'joined' },
      { user_id: 'b', status: 'joined' },
    ]);
    jest.advanceTimersByTime(31_000);
    expect(await w.svc.endSolo('c1')).toBe(false);
    expect(w.finish).not.toHaveBeenCalled();
    expect(w.call.solo_since).toBeNull();
  });

  it('0 seconds ends at once', async () => {
    const w = world(0);
    w.setRows([{ user_id: 'a', status: 'joined' }]);
    await w.svc.settleHeadcount(w.call, 'a');
    expect(w.finish).toHaveBeenCalledTimes(1);
  });

  it('nobody connected ends at once, unless somebody still rings', async () => {
    const w = world(30);
    w.setRows([{ user_id: 'a', status: 'left' }]);
    await w.svc.settleHeadcount(w.call, null);
    expect(w.finish).toHaveBeenCalledTimes(1);
    const r = world(30);
    r.setRows([
      { user_id: 'a', status: 'left' },
      { user_id: 'b', status: 'invited' },
    ]);
    await r.svc.settleHeadcount(r.call, null);
    expect(r.finish).not.toHaveBeenCalled();
  });

  it('a second stamp does not restart the grace (two instances)', async () => {
    const w = world(30);
    w.setRows([{ user_id: 'a', status: 'joined' }]);
    await w.svc.settleHeadcount(w.call, 'b');
    const first = w.call.solo_since;
    jest.advanceTimersByTime(10_000);
    await w.svc.settleHeadcount(w.call, 'b');
    expect(w.call.solo_since).toBe(first);
  });

  it('the cron sweep ends a due call', async () => {
    const w = world(30);
    w.setRows([{ user_id: 'a', status: 'joined' }]);
    await w.svc.settleHeadcount(w.call, 'b');
    jest.advanceTimersByTime(40_000);
    await w.svc.sweepSoloCalls(new Date());
    expect(w.finish).toHaveBeenCalledTimes(1);
  });
});
