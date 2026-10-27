import type { DayCounters } from './staff-card-watch';
import {
  anomalyDigestLine,
  MIN_OUTSIDE,
  MIN_VOLUME,
  median,
  scoreAnomalies,
} from './staff-anomaly.rules';

const c = (p: Partial<DayCounters>): DayCounters => ({
  opened: 0,
  outside: 0,
  burst: 0,
  reveals: 0,
  ...p,
});
const group = (rows: Record<string, Partial<DayCounters>>) =>
  new Map(Object.entries(rows).map(([k, v]) => [k, c(v)]));
const opts = { revealCap: 20, topN: 20 };

describe('staff anomaly rules (plan C4)', () => {
  it('median', () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('nobody is flagged on an ordinary day', () => {
    const rows = scoreAnomalies(
      group({
        a: { opened: 30 },
        b: { opened: 28, outside: 1 },
        c: { opened: 35 },
      }),
      opts,
    );
    expect(rows).toEqual([]);
  });

  it('cards outside the lease: needs the minimum and several times the median', () => {
    const day = group({
      a: { opened: 40, outside: MIN_OUTSIDE - 1 },
      b: { opened: 40, outside: MIN_OUTSIDE + 4 },
      c: { opened: 40, outside: 1 },
    });
    const rows = scoreAnomalies(day, opts);
    expect(rows.map((r) => [r.adminId, r.rule])).toEqual([
      ['b', 'outside_lease'],
    ]);
    expect(rows[0].detail).toMatchObject({
      outside: MIN_OUTSIDE + 4,
      median: 2,
    });
  });

  it('a minute over the cards-per-minute limit is a burst', () => {
    const rows = scoreAnomalies(group({ a: { burst: 2 }, b: {} }), opts);
    expect(rows).toEqual([
      {
        adminId: 'a',
        rule: 'cards_burst',
        score: 20,
        detail: { minutesOverLimit: 2, opened: 0 },
      },
    ]);
  });

  it('volume: far above the group median and above the floor', () => {
    const day = group({
      a: { opened: MIN_VOLUME + 100 },
      b: { opened: 40 },
      c: { opened: 45 },
    });
    const rows = scoreAnomalies(day, opts);
    expect(rows.map((r) => r.rule)).toEqual(['cards_volume']);
    // below the floor nobody is flagged even when everyone else is idle
    expect(
      scoreAnomalies(group({ a: { opened: 20 }, b: {}, c: {} }), opts),
    ).toEqual([]);
  });

  it('using the whole reveal allowance is reported', () => {
    const rows = scoreAnomalies(
      group({ a: { reveals: 20 }, b: { reveals: 19 } }),
      opts,
    );
    expect(rows.map((r) => [r.adminId, r.rule])).toEqual([['a', 'reveal_cap']]);
  });

  it('keeps the top-N by score', () => {
    const day = group({
      a: { burst: 1 },
      b: { burst: 5 },
      c: { burst: 3 },
    });
    const rows = scoreAnomalies(day, { ...opts, topN: 2 });
    expect(rows.map((r) => r.adminId)).toEqual(['b', 'c']);
  });

  it('digest line in plain Russian', () => {
    expect(anomalyDigestLine('2026-10-26', [])).toBe(
      'Подозрительного за 2026-10-26 нет.',
    );
    expect(
      anomalyDigestLine('2026-10-26', [
        { adminId: 'b', rule: 'cards_burst' },
        { adminId: 'b', rule: 'reveal_cap' },
        { adminId: 'c', rule: 'cards_burst' },
      ]),
    ).toBe(
      'За 2026-10-26: 2 сотр. с необычной работой с карточками (3 сигн.). Первым в списке: открывал карточки слишком быстро.',
    );
  });
});
