import {
  disputeRefundGuard,
  disputeRefundKey,
  disputeRefundReason,
  firstChargeCancelRef,
  firstChargeRefundable,
  inquiryRefundable,
  isFirstChargeCancelRef,
} from './dispute-refund.logic';

// R-237, sweep B-c3 (2026-11-09): a disputed subscription WITHOUT a bank —
// the attorney cancels right after the first charge. Behind the same switch.
describe('first-charge cancel refund rules (R-237 / B-c3)', () => {
  const day = 86_400_000;
  const now = new Date('2026-11-09T12:00:00Z');
  const base = {
    now,
    windowDays: 7,
    succeededPayments: 1,
    firstChargeAt: new Date(now.getTime() - 3 * day),
  };

  it('the first and only charge, inside the window: refundable', () => {
    expect(firstChargeRefundable(base)).toBe(true);
  });

  it('a second charge, or an older first charge, is not', () => {
    expect(firstChargeRefundable({ ...base, succeededPayments: 2 })).toBe(
      false,
    );
    expect(
      firstChargeRefundable({
        ...base,
        firstChargeAt: new Date(now.getTime() - 8 * day),
      }),
    ).toBe(false);
    expect(firstChargeRefundable({ ...base, succeededPayments: 0 })).toBe(
      false,
    );
  });

  it('a window of zero days switches the rule off', () => {
    expect(firstChargeRefundable({ ...base, windowDays: 0 })).toBe(false);
    expect(firstChargeRefundable({ ...base, windowDays: -1 })).toBe(false);
  });

  it('the row reference is per payment and tells the two kinds apart', () => {
    expect(firstChargeCancelRef('pay-1')).toBe('cancel:pay-1');
    expect(isFirstChargeCancelRef('cancel:pay-1')).toBe(true);
    expect(isFirstChargeCancelRef('dp_123')).toBe(false);
  });
});

describe('dispute refund rules (R-237)', () => {
  const ok = {
    fraudReview: false,
    priorDisputes: 0,
    refundCents: 30_000,
    maxCents: 50_000,
    userRefunds: 0,
    userLimit: 1,
    refundedTodayCents: 0,
    dailyCapCents: 100_000,
  };

  it('only an inquiry awaiting our answer that Stripe calls refundable', () => {
    const check = (status: string, chargeRefundable: boolean) =>
      inquiryRefundable({ status, chargeRefundable });
    expect(check('warning_needs_response', true)).toBe(true);
    expect(check('warning_needs_response', false)).toBe(false);
    // Evidence already sent: we chose to contest it.
    expect(check('warning_under_review', true)).toBe(false);
    expect(check('warning_closed', true)).toBe(false);
    // A chargeback: the bank already took the money.
    expect(check('needs_response', true)).toBe(false);
    expect(check('under_review', true)).toBe(false);
    expect(check('lost', true)).toBe(false);
  });

  it('within the limits goes out', () => {
    expect(disputeRefundGuard(ok)).toBeNull();
  });

  it('each limit holds it for a person', () => {
    expect(disputeRefundGuard({ ...ok, fraudReview: true })).toBe(
      'fraud_review',
    );
    expect(disputeRefundGuard({ ...ok, priorDisputes: 1 })).toBe(
      'prior_dispute',
    );
    expect(disputeRefundGuard({ ...ok, refundCents: 50_001 })).toBe(
      'over_amount',
    );
    expect(disputeRefundGuard({ ...ok, userRefunds: 1 })).toBe('user_limit');
    expect(disputeRefundGuard({ ...ok, refundedTodayCents: 70_001 })).toBe(
      'daily_cap',
    );
  });

  it('a limit of zero or below refunds nothing by itself', () => {
    expect(disputeRefundGuard({ ...ok, maxCents: -1 })).toBe('over_amount');
    expect(disputeRefundGuard({ ...ok, userLimit: 0 })).toBe('user_limit');
    expect(disputeRefundGuard({ ...ok, dailyCapCents: 0 })).toBe('daily_cap');
  });

  it('the key and the reason are fixed per dispute', () => {
    expect(disputeRefundKey('dp_1')).toBe('dispute:dp_1:refund');
    expect(disputeRefundReason('dp_1')).toBe('dispute_auto:dp_1');
  });
});
