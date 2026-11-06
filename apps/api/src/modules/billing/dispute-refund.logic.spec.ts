import {
  disputeRefundGuard,
  disputeRefundKey,
  disputeRefundReason,
  inquiryRefundable,
} from './dispute-refund.logic';

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
