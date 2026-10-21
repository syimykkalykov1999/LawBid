import { addMonthsIso, computeDeadline } from './deadline-calc';

const none = new Set<string>();

describe('computeDeadline', () => {
  it('counts calendar days from the day after the event', () => {
    // Mon 2026-10-05 + 21 = Mon 2026-10-26.
    const r = computeDeadline(
      '2026-10-05',
      { amount: 21, unit: 'day', dayType: 'calendar', direction: 'after' },
      none,
    );
    expect(r).toMatchObject({ dueDate: '2026-10-26', rolled: false });
  });

  it('rolls a Saturday forward to Monday', () => {
    // 2026-10-05 + 20 = Sat 2026-10-25 → Mon 2026-10-26.
    const r = computeDeadline(
      '2026-10-05',
      { amount: 20, unit: 'day', dayType: 'calendar', direction: 'after' },
      none,
    );
    expect(r).toMatchObject({
      rawDate: '2026-10-25',
      dueDate: '2026-10-26',
      rolled: true,
    });
  });

  it('rolls over a holiday after a weekend', () => {
    // Sat 2026-10-10 +  … a Monday holiday pushes to Tuesday.
    const r = computeDeadline(
      '2026-10-03',
      { amount: 7, unit: 'day', dayType: 'calendar', direction: 'after' },
      new Set(['2026-10-12']),
    );
    expect(r.rawDate).toBe('2026-10-10');
    expect(r.dueDate).toBe('2026-10-13');
    expect(r.holidaysUsed).toEqual(['2026-10-12']);
  });

  it('skips weekends and holidays when counting business days', () => {
    // Fri 2026-10-09, 3 business days, Mon 10-12 is a holiday → Wed 10-14? 13, 14, 15.
    const r = computeDeadline(
      '2026-10-09',
      { amount: 3, unit: 'day', dayType: 'business', direction: 'after' },
      new Set(['2026-10-12']),
    );
    expect(r.dueDate).toBe('2026-10-15');
    expect(r.rolled).toBe(false);
  });

  it('counts backwards and rolls back to the previous business day', () => {
    // Hearing Mon 2026-10-19, 14 days before = Mon 10-05 (open).
    expect(
      computeDeadline(
        '2026-10-19',
        { amount: 14, unit: 'day', dayType: 'calendar', direction: 'before' },
        none,
      ).dueDate,
    ).toBe('2026-10-05');
    // 15 days before = Sun 10-04 → Fri 10-02.
    expect(
      computeDeadline(
        '2026-10-19',
        { amount: 15, unit: 'day', dayType: 'calendar', direction: 'before' },
        none,
      ).dueDate,
    ).toBe('2026-10-02');
  });

  it('adds years and clamps to the end of the month', () => {
    expect(addMonthsIso('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsIso('2026-03-15', -4)).toBe('2025-11-15');
    // 2 years from Tue 2026-03-17 is Thu 2028-03-17.
    expect(
      computeDeadline(
        '2026-03-17',
        { amount: 2, unit: 'year', dayType: 'calendar', direction: 'after' },
        none,
      ).dueDate,
    ).toBe('2028-03-17');
  });

  it('rolls a statute that ends on a weekend', () => {
    // 1 year from 2025-10-24 (Fri) = Sat 2026-10-24 → Mon 2026-10-26.
    const r = computeDeadline(
      '2025-10-24',
      { amount: 1, unit: 'year', dayType: 'calendar', direction: 'after' },
      none,
    );
    expect(r).toMatchObject({ dueDate: '2026-10-26', rolled: true });
  });
});
