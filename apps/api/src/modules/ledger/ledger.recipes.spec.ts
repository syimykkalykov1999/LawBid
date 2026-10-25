import {
  bankPayoutLines,
  casePaymentLines,
  casePaymentRefundLines,
  expensePaidLines,
  isBalanced,
  platformChargeLines,
  reverseProportional,
  stripeFeeLines,
  suspenseLines,
  type Line,
} from './ledger.recipes';

const sum = (lines: Line[], side: 'debit' | 'credit') =>
  lines.filter((l) => l.direction === side).reduce((s, l) => s + l.cents, 0);

describe('ledger recipes balance for any amount', () => {
  const amounts = [1, 7, 99, 100, 1234, 29_900, 1_000_001];

  it.each(amounts)('platform charge %i with and without tax', (gross) => {
    for (const tax of [0, Math.floor(gross * 0.08), gross]) {
      const lines = platformChargeLines({
        grossCents: gross,
        taxCents: tax,
        target: 'revenue_subscriptions',
      });
      expect(isBalanced(lines)).toBe(true);
      expect(sum(lines, 'debit')).toBe(gross);
    }
  });

  it('a negative or absurd tax cannot unbalance the entry', () => {
    expect(
      isBalanced(
        platformChargeLines({
          grossCents: 500,
          taxCents: -50,
          target: 'revenue_bid_packs',
        }),
      ),
    ).toBe(true);
    expect(
      isBalanced(
        platformChargeLines({
          grossCents: 500,
          taxCents: 9999,
          target: 'stars_outstanding',
        }),
      ),
    ).toBe(true);
  });

  it.each(amounts)('proportional refund of %i reverses the charge', (gross) => {
    const charge = platformChargeLines({
      grossCents: gross,
      taxCents: Math.floor(gross * 0.07),
      target: 'revenue_subscriptions',
    });
    for (const refund of [1, Math.ceil(gross / 3), gross]) {
      if (refund > gross) continue;
      const back = reverseProportional(charge, refund, gross);
      expect(isBalanced(back)).toBe(true);
      expect(sum(back, 'credit')).toBe(refund);
    }
    // full refund = exact mirror image
    const full = reverseProportional(charge, gross, gross);
    expect(full.map((l) => [l.account.code, l.cents]).sort()).toEqual(
      charge.map((l) => [l.account.code, l.cents]).sort(),
    );
    expect(full.every((l, i) => l.direction !== charge[i].direction)).toBe(
      true,
    );
  });

  it('refund nothing / of nothing is empty', () => {
    expect(reverseProportional([], 100, 0)).toEqual([]);
    expect(reverseProportional([], 0, 100)).toEqual([]);
  });

  it.each([
    [10_000, 500, 9_000],
    [10_330, 500, 9_500],
    [10_000, 0, 10_000],
    [10_000, 500, 9_500],
    [333, 17, 300],
    [10_000, 500, 9_900], // net + fee > total after rounding
  ])('case payment total %i fee %i net %i', (total, fee, net) => {
    const lines = casePaymentLines({
      attorneyId: 'a',
      clientTotalCents: total,
      platformFeeCents: fee,
      attorneyNetCents: net,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(sum(lines, 'debit')).toBe(total);
    // only the fee reaches the platform balance
    const platform = lines.find(
      (l) => l.account.code === 'stripe_platform_balance',
    );
    expect(platform?.cents ?? 0).toBe(fee);
  });

  it.each([
    [1000, 10_000, 500, true],
    [10_000, 10_000, 500, true],
    [3333, 10_000, 500, true],
    [10_000, 10_000, 500, false],
    [1, 10_000, 0, true],
  ])(
    'case refund %i of %i (fee %i, fee back %s)',
    (refund, total, fee, back) => {
      const lines = casePaymentRefundLines({
        attorneyId: 'a',
        refundCents: refund,
        clientTotalCents: total,
        platformFeeCents: fee,
        refundApplicationFee: back,
      });
      expect(isBalanced(lines)).toBe(true);
      expect(sum(lines, 'debit')).toBe(refund);
    },
  );

  it('a full refund with fee back returns the whole fee', () => {
    const lines = casePaymentRefundLines({
      attorneyId: 'a',
      refundCents: 10_000,
      clientTotalCents: 10_000,
      platformFeeCents: 500,
      refundApplicationFee: true,
    });
    expect(
      lines.find((l) => l.account.code === 'revenue_case_fees')?.cents,
    ).toBe(500);
  });

  it('fees, payouts, suspense and expenses balance', () => {
    expect(isBalanced(stripeFeeLines(88))).toBe(true);
    expect(isBalanced(bankPayoutLines(5000))).toBe(true);
    expect(isBalanced(suspenseLines(300))).toBe(true);
    expect(isBalanced(suspenseLines(-300))).toBe(true);
    expect(isBalanced(expensePaidLines('expense_payroll', 1200))).toBe(true);
    expect(stripeFeeLines(0)).toEqual([]);
  });
});
