import { proratedCents } from './subscription-admin.service';

describe('proratedCents', () => {
  const start = new Date('2026-10-01T00:00:00Z');
  const end = new Date('2026-10-31T00:00:00Z');

  it('refunds the unused share of the period', () => {
    const mid = new Date('2026-10-16T00:00:00Z').getTime();
    expect(proratedCents(30_000, start, end, mid)).toBe(15_000);
  });

  it('is the whole amount before the period and nothing after it', () => {
    expect(proratedCents(30_000, start, end, start.getTime() - 1000)).toBe(
      30_000,
    );
    expect(proratedCents(30_000, start, end, end.getTime() + 1000)).toBe(0);
  });

  it('is nothing without a period', () => {
    expect(proratedCents(30_000, null, end)).toBe(0);
    expect(proratedCents(30_000, end, start)).toBe(0);
  });
});
