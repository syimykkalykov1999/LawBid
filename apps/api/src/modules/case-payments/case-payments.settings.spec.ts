import {
  DEFAULT_PAYMENT_SETTINGS,
  parsePaymentSettings,
  quotePayment,
} from './case-payments.settings';
import { payoutStatusOf } from './case-payments.service';

describe('case payment settings', () => {
  it('defaults: no platform fee, Stripe fee passed on, disclaimer set', () => {
    const s = parsePaymentSettings(null);
    expect(s).toEqual(DEFAULT_PAYMENT_SETTINGS);
    expect(s.feeType).toBe('none');
    expect(s.disclaimerEn).toContain('no share');
    expect(s.disclaimerRu).toContain('не получает долю');
    expect(s.feeFixedCents).toBe(0);
    expect(s.feePayer).toBe('client');
    expect(s.passProcessingFeeToClient).toBe(true);
  });

  it('ignores junk and keeps min ≤ max', () => {
    const s = parsePaymentSettings({
      feeType: 'percent',
      feeFixedCents: -5,
      disclaimerEn: '   ',
      minAmountCents: 10_000,
      maxAmountCents: 2_000,
      refundWindowDays: 999,
    });
    expect(s.feeType).toBe('none');
    expect(s.feeFixedCents).toBe(0);
    expect(s.disclaimerEn).toBe(DEFAULT_PAYMENT_SETTINGS.disclaimerEn);
    expect(s.minAmountCents).toBeLessThanOrEqual(s.maxAmountCents);
    expect(s.refundWindowDays).toBe(DEFAULT_PAYMENT_SETTINGS.refundWindowDays);
  });
});

describe('quotePayment', () => {
  const base = {
    ...DEFAULT_PAYMENT_SETTINGS,
    passProcessingFeeToClient: false,
  };

  it('no fee: client pays the amount, attorney gets it all', () => {
    const q = quotePayment(50_000, base);
    expect(q).toMatchObject({
      amountCents: 50_000,
      platformFeeCents: 0,
      processingFeeCents: 0,
      clientTotalCents: 50_000,
      attorneyNetCents: 50_000,
    });
  });

  it('fixed fee on top: added to the client total', () => {
    const q = quotePayment(50_000, {
      ...base,
      feeType: 'fixed',
      feeFixedCents: 500,
    });
    expect(q.platformFeeCents).toBe(500);
    expect(q.clientTotalCents).toBe(50_500);
    expect(q.attorneyNetCents).toBe(50_000);
  });

  it('fixed fee deducted from the attorney', () => {
    const q = quotePayment(50_000, {
      ...base,
      feeType: 'fixed',
      feeFixedCents: 500,
      feePayer: 'attorney',
    });
    expect(q.platformFeeCents).toBe(500);
    expect(q.clientTotalCents).toBe(50_000);
    expect(q.attorneyNetCents).toBe(49_500);
  });

  it('attorney-paid fee never exceeds the payment', () => {
    const q = quotePayment(100, {
      ...base,
      feeType: 'fixed',
      feeFixedCents: 500,
      feePayer: 'attorney',
    });
    expect(q.platformFeeCents).toBe(100);
    expect(q.attorneyNetCents).toBe(0);
  });

  it('processing fee gross-up covers 2.9 % + 30 ¢ of the total', () => {
    const q = quotePayment(10_000, DEFAULT_PAYMENT_SETTINGS);
    const stripeFee = Math.round(q.clientTotalCents * 0.029) + 30;
    expect(q.clientTotalCents - stripeFee).toBeGreaterThanOrEqual(10_000);
    expect(q.processingFeeCents).toBeLessThan(400);
  });
});

describe('payoutStatusOf', () => {
  const acct = {
    id: 'acct_1',
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    requirementsDue: [] as string[],
    disabledReason: null as string | null,
    country: 'US',
  };
  it('maps Stripe account states', () => {
    expect(payoutStatusOf(acct)).toBe('onboarding');
    expect(
      payoutStatusOf({ ...acct, chargesEnabled: true, payoutsEnabled: true }),
    ).toBe('active');
    expect(payoutStatusOf({ ...acct, detailsSubmitted: true })).toBe(
      'restricted',
    );
    expect(payoutStatusOf({ ...acct, disabledReason: 'rejected.fraud' })).toBe(
      'disabled',
    );
  });
});
