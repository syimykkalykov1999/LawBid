import { describe, expect, it } from 'vitest';
import { dateInput, dateToIso, goalPercent, goalValue, periodLabel } from './country-partners';

describe('country partner helpers', () => {
  it('goal progress is a 0–100 bar; revenue shown in dollars', () => {
    expect(goalPercent(25, 50)).toBe(50);
    expect(goalPercent(80, 50)).toBe(100);
    expect(goalPercent(5, 0)).toBe(0);
    expect(goalValue('revenue_cents', 123450)).toBe('$1,234.50');
    expect(goalValue('attorneys', 12)).toBe('12');
  });

  it('months and dates', () => {
    expect(periodLabel('2026-10')).toMatch(/2026/);
    expect(dateInput('2026-12-31T00:00:00.000Z')).toBe('2026-12-31');
    expect(dateToIso('2026-12-31')).toBe('2026-12-31T00:00:00.000Z');
    expect(dateToIso('')).toBeNull();
  });
});
