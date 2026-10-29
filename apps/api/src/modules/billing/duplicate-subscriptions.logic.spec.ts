import {
  attorneyLiveSubscriptions,
  duplicateActionKey,
  duplicateRefundCents,
  type DuplicateCandidate,
  pickKeeper,
  refundGuard,
  tooManyDuplicates,
} from './duplicate-subscriptions.logic';

const NOW = 1_800_000_000;
const DAY = 86_400;

const sub = (
  p: Partial<DuplicateCandidate> & { id: string },
): DuplicateCandidate => ({
  customerId: 'cus_1',
  status: 'active',
  created: NOW - 10 * DAY,
  currentPeriodStart: NOW - 10 * DAY,
  currentPeriodEnd: NOW + 20 * DAY,
  metadata: { userId: 'u1' },
  lastPaid: null,
  ...p,
});

const paid = (cents: number, paidAt = NOW - 10 * DAY) => ({
  invoiceId: `in_${cents}_${paidAt}`,
  amountCents: cents,
  paidAt,
  paymentIntentId: `pi_${cents}`,
  currency: 'usd',
});

describe('duplicate subscriptions — detection', () => {
  it('only the attorney’s own live plan subscriptions on their customer', () => {
    const all = [
      sub({ id: 'a' }),
      sub({ id: 'b', status: 'past_due' }),
      sub({ id: 'canceled', status: 'canceled' }),
      sub({ id: 'incomplete', status: 'incomplete' }),
      sub({ id: 'other_customer', customerId: 'cus_2' }),
      sub({ id: 'other_user', metadata: { userId: 'u2' } }),
      sub({ id: 'badge', metadata: { userId: 'u1', kind: 'client_badge' } }),
      sub({ id: 'plan', metadata: { kind: 'client_plan' } }),
      sub({ id: 'no_meta', metadata: {} }),
    ];
    expect(
      attorneyLiveSubscriptions(all, { userId: 'u1', customerId: 'cus_1' }).map(
        (s) => s.id,
      ),
    ).toEqual(['a', 'b', 'no_meta']);
  });
});

describe('duplicate subscriptions — which one stays', () => {
  it('keeps the newest successfully paid one (latest paid period)', () => {
    const old = sub({ id: 'old', lastPaid: paid(39_900) });
    const fresh = sub({
      id: 'new',
      created: NOW,
      currentPeriodStart: NOW,
      currentPeriodEnd: NOW + 30 * DAY,
      lastPaid: paid(39_900, NOW),
    });
    expect(pickKeeper([old, fresh])?.id).toBe('new');
    expect(pickKeeper([fresh, old])?.id).toBe('new');
  });

  it('a paid subscription beats a newer unpaid one (trial bought twice)', () => {
    const old = sub({ id: 'old', lastPaid: paid(39_900) });
    const trial = sub({
      id: 'trial',
      status: 'trialing',
      created: NOW,
      currentPeriodEnd: NOW + 60 * DAY,
    });
    expect(pickKeeper([trial, old])?.id).toBe('old');
  });

  it('a yearly paid period beats a newer monthly one (latest paid period)', () => {
    const yearly = sub({
      id: 'yearly',
      currentPeriodEnd: NOW + 300 * DAY,
      lastPaid: paid(959_000),
    });
    const monthly = sub({
      id: 'monthly',
      created: NOW,
      currentPeriodStart: NOW,
      currentPeriodEnd: NOW + 30 * DAY,
      lastPaid: paid(39_900, NOW),
    });
    expect(pickKeeper([monthly, yearly])?.id).toBe('yearly');
  });

  it('never keeps a failing (past_due) one over a healthy one', () => {
    const stale = sub({
      id: 'stale',
      status: 'past_due',
      currentPeriodEnd: NOW + 25 * DAY,
      lastPaid: paid(39_900, NOW - 40 * DAY),
    });
    const fresh = sub({ id: 'fresh', status: 'trialing', created: NOW });
    expect(pickKeeper([stale, fresh])?.id).toBe('fresh');
  });

  it('is deterministic on a full tie', () => {
    const a = sub({ id: 'sub_a' });
    const b = sub({ id: 'sub_b' });
    expect(pickKeeper([a, b])?.id).toBe(pickKeeper([b, a])?.id);
    expect(pickKeeper([])).toBeNull();
  });
});

describe('duplicate subscriptions — refund bounds', () => {
  const base = {
    chargedCents: 30_000,
    alreadyRefundedCents: 0,
    periodStart: NOW - 10 * DAY,
    periodEnd: NOW + 20 * DAY,
    keeperPeriodStart: NOW,
    nowSec: NOW,
  };

  it('refunds only the unused remainder of the last invoice', () => {
    expect(duplicateRefundCents(base)).toEqual({ cents: 20_000, reason: null });
  });

  it('never more than the charge, never more than what is left unrefunded', () => {
    const early = duplicateRefundCents({
      ...base,
      periodStart: NOW + 5,
      periodEnd: NOW + 30 * DAY,
      nowSec: NOW,
    });
    expect(early.cents).toBeLessThanOrEqual(30_000);
    expect(
      duplicateRefundCents({ ...base, alreadyRefundedCents: 25_000 }).cents,
    ).toBe(5_000);
    expect(
      duplicateRefundCents({ ...base, alreadyRefundedCents: 30_000 }),
    ).toEqual({ cents: 0, reason: 'already_refunded' });
  });

  it('nothing when nothing was charged', () => {
    expect(duplicateRefundCents({ ...base, chargedCents: 0 })).toEqual({
      cents: 0,
      reason: 'no_charge',
    });
    expect(duplicateRefundCents({ ...base, chargedCents: -5 }).cents).toBe(0);
  });

  it('grace re-subscription: a stale subscription whose paid period is over gets nothing', () => {
    expect(
      duplicateRefundCents({
        ...base,
        periodStart: NOW - 40 * DAY,
        periodEnd: NOW - 10 * DAY,
      }),
    ).toEqual({ cents: 0, reason: 'period_over' });
  });

  it('no refund when the paid period does not overlap the kept one', () => {
    expect(
      duplicateRefundCents({
        ...base,
        periodEnd: NOW + 2 * DAY,
        keeperPeriodStart: NOW + 3 * DAY,
      }),
    ).toEqual({ cents: 0, reason: 'no_overlap' });
  });

  it('the same cancel moment gives the same amount on every retry', () => {
    expect(duplicateRefundCents(base)).toEqual(duplicateRefundCents(base));
  });
});

describe('duplicate subscriptions — anti-abuse guards', () => {
  const ok = {
    sameAccount: true,
    disputed: false,
    fraudReview: false,
    refundCents: 10_000,
    chargedCents: 39_900,
    refundedTodayCents: 0,
    dailyCapCents: 50_000,
  };

  it('lets a clean refund through', () => {
    expect(refundGuard(ok)).toBeNull();
  });

  it('cross-account, dispute, fraud review, above the charge, above the cap', () => {
    expect(refundGuard({ ...ok, sameAccount: false })).toBe('cross_account');
    expect(refundGuard({ ...ok, disputed: true })).toBe('dispute');
    expect(refundGuard({ ...ok, fraudReview: true })).toBe('fraud_review');
    expect(refundGuard({ ...ok, refundCents: 40_000 })).toBe('over_charge');
    expect(refundGuard({ ...ok, refundedTodayCents: 45_000 })).toBe(
      'daily_cap',
    );
    expect(refundGuard({ ...ok, dailyCapCents: 0 })).toBe('daily_cap');
  });

  it('exactly at the cap is still allowed', () => {
    expect(refundGuard({ ...ok, refundedTodayCents: 40_000 })).toBeNull();
  });

  it('the third duplicate within 90 days stops the automation', () => {
    expect(tooManyDuplicates(0)).toBe(false);
    expect(tooManyDuplicates(1)).toBe(false);
    expect(tooManyDuplicates(2)).toBe(true);
  });

  it('one Stripe idempotency key per subscription and action', () => {
    expect(duplicateActionKey('sub_1', 'cancel')).toBe('dupsub:sub_1:cancel');
    expect(duplicateActionKey('sub_1', 'refund')).toBe('dupsub:sub_1:refund');
    expect(duplicateActionKey('sub_1', 'refund')).not.toBe(
      duplicateActionKey('sub_2', 'refund'),
    );
  });
});
