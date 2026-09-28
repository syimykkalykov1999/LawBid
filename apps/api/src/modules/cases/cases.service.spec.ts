import { budgetCentsOf } from './cases.service';

describe('budgetCentsOf (docs/04_CASES_BIDS.md §3.2)', () => {
  it('clarify_later has no amount', () => {
    expect(budgetCentsOf('clarify_later', undefined)).toBeNull();
  });

  it('converts whole dollars to cents for "amount"', () => {
    expect(budgetCentsOf('amount', 1)).toBe(100);
    expect(budgetCentsOf('amount', 600)).toBe(60_000);
    expect(budgetCentsOf('amount', 10_000_000)).toBe(1_000_000_000);
  });

  it.each([
    ['undefined', undefined],
    ['zero', 0],
    ['negative', -5],
    ['non-integer', 12.5],
  ])('rejects "amount" with %s dollars', (_label, amount) => {
    expect(() => budgetCentsOf('amount', amount)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
  });
});
