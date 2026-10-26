import { describe, expect, it } from 'vitest';
import { contractEnded, dateInput, dateToIso, goalPercent, goalValue, periodLabel } from './country-partners';

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

describe('contractEnded', () => {
  it('the partner works through the last day and stops after it', () => {
    const end = '2026-12-31T00:00:00.000Z';
    expect(contractEnded(end, new Date('2026-12-31T23:59:59Z'))).toBe(false);
    expect(contractEnded(end, new Date('2027-01-01T00:00:00Z'))).toBe(true);
    expect(contractEnded(null)).toBe(false);
    expect(contractEnded('nonsense')).toBe(false);
  });
});
