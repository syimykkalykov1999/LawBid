import { digestText, lastWeekStart, returnedPct } from './staff-digest.logic';

describe('weekly digest: the «5 чисел»', () => {
  it('lastWeekStart is the Monday of the week that ended', () => {
    // Monday 2026-10-26 13:00 UTC → the week of 2026-10-19
    expect(lastWeekStart(new Date('2026-10-26T13:00:00Z')).toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    // a Wednesday also points to the previous full week
    expect(lastWeekStart(new Date('2026-10-28T09:00:00Z')).toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    // Sunday belongs to the week that is still running
    expect(lastWeekStart(new Date('2026-10-25T23:00:00Z')).toISOString()).toBe(
      '2026-10-12T00:00:00.000Z',
    );
  });

  it('returnedPct: one decimal, null without decisions', () => {
    expect(returnedPct(0, 0)).toBeNull();
    expect(returnedPct(200, 7)).toBe(3.5);
  });

  it('text has exactly five numbered lines in plain Russian', () => {
    const t = digestText('2026-10-19', {
      decisions: 1234,
      returnedPct: 3.5,
      appeals: 2,
      worstCount: 3,
      bestCount: 4,
      worstName: 'Пётр Иванов',
      bestName: 'Анна Смирнова',
      pieceworkCents: 123456,
      currency: 'usd',
    });
    expect(t.title).toContain('2026-10-19');
    const lines = t.body.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain('3,5 %');
    expect(lines[3]).toContain('хуже всех: Пётр Иванов');
    expect(lines[3]).toContain('первый: Анна Смирнова');
    expect(lines[4]).toContain('$');
  });

  it('missing numbers say so instead of showing zero', () => {
    const t = digestText('2026-10-19', {
      decisions: 0,
      returnedPct: null,
      appeals: 0,
      worstCount: 0,
      bestCount: 0,
      worstName: null,
      bestName: null,
      pieceworkCents: 0,
      currency: 'usd',
    });
    expect(t.body).toContain('нет данных');
    expect(t.body).toContain('слабых нет');
    expect(t.body).toContain('лучших пока нет');
  });
});
