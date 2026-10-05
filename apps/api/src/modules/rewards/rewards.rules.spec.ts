import {
  isPeriod,
  periodOf,
  periodRange,
  previousPeriod,
  rank,
  score,
} from './rewards.rules';

describe('rewards rules (owner 2026-10-05)', () => {
  it('names months and ISO weeks', () => {
    const at = new Date('2026-10-05T10:00:00Z');
    expect(periodOf('month', at)).toBe('2026-10');
    expect(periodOf('week', at)).toBe('2026-W41');
    expect(previousPeriod('month', at)).toBe('2026-09');
    expect(previousPeriod('week', at)).toBe('2026-W40');
    expect(previousPeriod('month', new Date('2026-01-10T00:00:00Z'))).toBe(
      '2025-12',
    );
  });

  it('turns a period into its range', () => {
    expect(periodRange('2026-10')).toEqual({
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
    });
    expect(periodRange('2026-W41').from.toISOString()).toBe(
      '2026-10-05T00:00:00.000Z',
    );
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod('2026-W41')).toBe(true);
    expect(isPeriod('oops')).toBe(false);
  });

  it('scores finished work; a late answer costs a point', () => {
    expect(score('verification', { decisions: 12, medianMinutes: 30 })).toBe(
      12,
    );
    expect(
      score('support', { resolved: 5, firstResponses: 4, slaBreaches: 2 }),
    ).toBe(7);
    expect(
      score('support', { resolved: 0, firstResponses: 0, slaBreaches: 3 }),
    ).toBe(0);
    expect(score('moderation', { reports: 3, actions: 2 })).toBe(5);
  });

  it('ranks by score, then speed; ties share a place; zeros are out', () => {
    const r = rank([
      { name: 'A', score: 10, tiebreak: 20 },
      { name: 'B', score: 10, tiebreak: 5 },
      { name: 'C', score: 10, tiebreak: 5 },
      { name: 'D', score: 0, tiebreak: 0 },
      { name: 'E', score: 3, tiebreak: 0 },
    ]);
    expect(r.map((x) => [x.item.name, x.rank])).toEqual([
      ['B', 1],
      ['C', 1],
      ['A', 3],
      ['E', 4],
    ]);
  });
});
