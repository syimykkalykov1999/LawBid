import {
  currentSchedule,
  dayWindow,
  daysEndedIn,
  labelAt,
  withZone,
  type DaySchedule,
} from './report-day-schedule';

/**
 * Row 180 follow-up B9: money days (piecework pay) follow the owner's
 * report time zone with a safe cut-over — the day windows always tile the
 * timeline: no instant in two days (paid twice), none in no day (skipped).
 */
describe('report day schedule', () => {
  const H = 3_600_000;
  const at = (s: string) => new Date(s);
  const next = (d: string) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

  /** Every window from [first] for [n] days touches the next one. */
  function expectTiled(s: DaySchedule, first: string, n: number) {
    let d = first;
    for (let i = 0; i < n; i++) {
      const w = dayWindow(s, d);
      const w2 = dayWindow(s, next(d));
      expect(w.to.getTime()).toBe(w2.from.getTime());
      expect(w.to.getTime()).toBeGreaterThanOrEqual(w.from.getTime());
      d = next(d);
    }
  }

  it('no schedule = the old UTC days', () => {
    expect(dayWindow([], '2026-11-10')).toEqual({
      from: at('2026-11-10T00:00:00Z'),
      to: at('2026-11-11T00:00:00Z'),
    });
  });

  it('the cut-over starts tomorrow: today (not finished) runs to local midnight; past days keep their UTC windows', () => {
    const now = at('2026-11-12T05:00:00Z');
    const s = withZone([], 'America/Los_Angeles', now)!;
    expect(s).toEqual([{ from: '2026-11-13', tz: 'America/Los_Angeles' }]);
    // a day already counted the old way is untouched
    expect(dayWindow(s, '2026-11-11')).toEqual({
      from: at('2026-11-11T00:00:00Z'),
      to: at('2026-11-12T00:00:00Z'),
    });
    // the switch day: UTC midnight → Nevada midnight (32 h, nothing lost)
    expect(dayWindow(s, '2026-11-12')).toEqual({
      from: at('2026-11-12T00:00:00Z'),
      to: at('2026-11-13T08:00:00Z'),
    });
    // then plain Nevada days
    expect(dayWindow(s, '2026-11-13')).toEqual({
      from: at('2026-11-13T08:00:00Z'),
      to: at('2026-11-14T08:00:00Z'),
    });
    expectTiled(s, '2026-11-01', 40);
  });

  it('same zone again: nothing changes', () => {
    const s: DaySchedule = [{ from: '2026-11-13', tz: 'America/Los_Angeles' }];
    expect(
      withZone(s, 'America/Los_Angeles', at('2026-12-01T00:00:00Z')),
    ).toBeNull();
    expect(withZone([], 'UTC', at('2026-12-01T00:00:00Z'))).toBeNull();
  });

  it('a later zone change (Nevada → Moscow) is its own safe cut-over', () => {
    const s1: DaySchedule = [{ from: '2026-11-13', tz: 'America/Los_Angeles' }];
    const now = at('2026-11-20T12:00:00Z'); // 04:00 on the 20th in Nevada
    const s2 = withZone(s1, 'Europe/Moscow', now)!;
    expect(s2[1]).toEqual({ from: '2026-11-21', tz: 'Europe/Moscow' });
    // the 20th (running now) ends at Moscow midnight of the 21st, which
    // is before its Nevada end: a 13-hour day, still no gap or overlap
    expect(dayWindow(s2, '2026-11-20')).toEqual({
      from: at('2026-11-20T08:00:00Z'),
      to: at('2026-11-20T21:00:00Z'),
    });
    expectTiled(s2, '2026-11-01', 40);
  });

  it('a jump of more than a day east never makes a day start before the previous one', () => {
    const s1: DaySchedule = [{ from: '2026-11-01', tz: 'Pacific/Pago_Pago' }]; // UTC-11
    const s2 = withZone(s1, 'Pacific/Kiritimati', at('2026-11-10T12:00:00Z'))!; // UTC+14
    expectTiled(s2, '2026-10-25', 30);
  });

  it('DST: a Nevada day is 23 or 25 hours, still tiled', () => {
    const s: DaySchedule = [{ from: '2026-01-01', tz: 'America/Los_Angeles' }];
    const w = dayWindow(s, '2026-11-01'); // fall back
    expect(w.to.getTime() - w.from.getTime()).toBe(25 * H);
    expectTiled(s, '2026-02-25', 300);
  });

  it('labelAt is the day whose window holds the instant', () => {
    const s = withZone([], 'America/Los_Angeles', at('2026-11-12T05:00:00Z'))!;
    expect(labelAt(s, at('2026-11-13T07:59:00Z'))).toBe('2026-11-12');
    expect(labelAt(s, at('2026-11-13T08:00:00Z'))).toBe('2026-11-13');
    expect(labelAt([], at('2026-11-13T23:59:00Z'))).toBe('2026-11-13');
  });

  it('daysEndedIn: every day whose end falls in (from, to], oldest first', () => {
    const s = withZone([], 'America/Los_Angeles', at('2026-11-12T05:00:00Z'))!;
    expect(
      daysEndedIn(s, at('2026-11-12T10:15:00Z'), at('2026-11-14T10:15:00Z')),
    ).toEqual(['2026-11-12', '2026-11-13']);
    expect(
      daysEndedIn(s, at('2026-11-13T09:00:00Z'), at('2026-11-14T10:15:00Z')),
    ).toEqual(['2026-11-13']);
  });

  describe('currentSchedule (stored once, compare-and-set)', () => {
    function store(initial?: unknown) {
      let row: { key: string; value: unknown } | null =
        initial === undefined ? null : { key: 'k', value: initial };
      const appConfig = {
        findUnique: jest.fn(() => Promise.resolve(row)),
        createMany: jest.fn(
          ({ data }: { data: { key: string; value: unknown }[] }) => {
            if (row) return Promise.resolve({ count: 0 });
            row = { ...data[0] };
            return Promise.resolve({ count: 1 });
          },
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { value: { equals: unknown } };
            data: { value: unknown };
          }) => {
            if (
              !row ||
              JSON.stringify(row.value) !== JSON.stringify(where.value.equals)
            )
              return Promise.resolve({ count: 0 });
            row = { ...row, value: data.value };
            return Promise.resolve({ count: 1 });
          },
        ),
      };
      return { prisma: { appConfig }, get: () => row };
    }

    it('the first read under the new zone fixes the cut-over and stores it', async () => {
      const st = store();
      const now = at('2026-11-12T05:00:00Z');
      const s = await currentSchedule(
        st.prisma as never,
        'k',
        'America/Los_Angeles',
        now,
      );
      expect(s).toEqual([{ from: '2026-11-13', tz: 'America/Los_Angeles' }]);
      expect(st.get()!.value).toEqual(s);
      // a later read (days after) keeps the SAME cut-over
      const later = await currentSchedule(
        st.prisma as never,
        'k',
        'America/Los_Angeles',
        at('2026-11-20T00:00:00Z'),
      );
      expect(later).toEqual(s);
    });

    it('UTC zone and no row: nothing is written (the old days)', async () => {
      const st = store();
      expect(
        await currentSchedule(
          st.prisma as never,
          'k',
          'UTC',
          at('2026-11-12T05:00:00Z'),
        ),
      ).toEqual([]);
      expect(st.prisma.appConfig.createMany).not.toHaveBeenCalled();
    });

    it('a broken stored value is read as no schedule, and replaced', async () => {
      const st = store('garbage');
      const s = await currentSchedule(
        st.prisma as never,
        'k',
        'America/Los_Angeles',
        at('2026-11-12T05:00:00Z'),
      );
      expect(s).toEqual([{ from: '2026-11-13', tz: 'America/Los_Angeles' }]);
    });
  });
});
