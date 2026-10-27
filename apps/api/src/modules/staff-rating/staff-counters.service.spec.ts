import type { PrismaService } from '../../prisma/prisma.service';
import {
  StaffCountersService,
  dayKey,
  parseCounters,
  toCounterRow,
} from './staff-counters.service';
import { FakeStaffRedis } from './staff-rating.test-support';

const A = '11111111-1111-4111-8111-111111111111';
const B = '44444444-4444-4444-8444-444444444444';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('StaffCountersService', () => {
  const at = new Date('2026-10-26T14:30:00Z');

  function make() {
    const redis = new FakeStaffRedis();
    const executeRaw = jest.fn(() => Promise.resolve(1));
    const prisma = { $executeRaw: executeRaw } as unknown as PrismaService;
    return {
      redis,
      executeRaw,
      svc: new StaffCountersService(prisma, redis.asRedis()),
    };
  }

  it('counts decisions, time buckets, hours and outcomes per admin and day', async () => {
    const { svc } = make();
    for (let i = 1; i <= 3; i++) {
      await svc.bump(
        {
          adminId: A,
          itemKind: 'report',
          itemId: id(i),
          outcome: 'hide',
          handleMs: 20_000,
        },
        at,
      );
    }
    await svc.bump(
      {
        adminId: A,
        itemKind: 'report',
        itemId: id(9),
        outcome: 'dismiss',
        handleMs: 400_000,
      },
      at,
    );
    const [c] = await svc.readDay('2026-10-26');
    expect(c).toMatchObject({
      adminId: A,
      decided: 4,
      handleN: 4,
      handleMsSum: 460_000,
    });
    expect(c.outcomes).toEqual({ hide: 3, dismiss: 1 });
    expect(c.hours[14]).toBe(4);
    expect(toCounterRow(c)).toMatchObject({ decided: 4, avgHandleSec: 115 });
  });

  it('keeps people apart', async () => {
    const { svc } = make();
    await svc.bump(
      { adminId: A, itemKind: 'x', itemId: id(1), outcome: 'a' },
      at,
    );
    await svc.bump(
      { adminId: B, itemKind: 'x', itemId: id(2), outcome: 'a' },
      at,
    );
    const all = await svc.readDay('2026-10-26');
    expect(all.map((c) => c.adminId).sort()).toEqual([A, B].sort());
    expect(await svc.readDay('2026-10-25')).toEqual([]);
  });

  it('flushing the same day twice writes the same absolute values (idempotent)', async () => {
    const { svc, executeRaw } = make();
    await svc.bump(
      {
        adminId: A,
        itemKind: 'x',
        itemId: id(1),
        outcome: 'a',
        handleMs: 8_000,
      },
      at,
    );
    await svc.flushDay('2026-10-26');
    await svc.flushDay('2026-10-26');
    expect(executeRaw).toHaveBeenCalledTimes(2);
    const calls = executeRaw.mock.calls as unknown as Array<
      [string[], ...unknown[]]
    >;
    // the bound values (admin, day, numbers) are the same both times
    expect(JSON.stringify(calls[0].slice(1))).toBe(
      JSON.stringify(calls[1].slice(1)),
    );
    // SET, never add: the conflict branch assigns EXCLUDED values.
    const text = calls[0][0].join('?');
    expect(text).toContain('decided = EXCLUDED.decided');
    expect(text).not.toMatch(/decided\s*=\s*staff_daily_stats\.decided\s*\+/);
  });

  it('nothing counted → no write', async () => {
    const { svc, executeRaw } = make();
    expect(await svc.flushRecent(at)).toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('the day is the UTC date', () => {
    expect(dayKey(new Date('2026-10-26T23:59:59Z'))).toBe('2026-10-26');
    expect(dayKey(new Date('2026-10-27T00:00:00Z'))).toBe('2026-10-27');
  });

  it('parses a counter hash', () => {
    const c = parseCounters(A, '2026-10-26', {
      d: '5',
      h: '100',
      n: '2',
      b1: '2',
      hr3: '5',
      o_approve: '5',
    });
    expect(c).toMatchObject({ decided: 5, handleMsSum: 100, handleN: 2 });
    expect(c.buckets[1]).toBe(2);
    expect(c.hours[3]).toBe(5);
    expect(c.outcomes).toEqual({ approve: 5 });
  });
});
