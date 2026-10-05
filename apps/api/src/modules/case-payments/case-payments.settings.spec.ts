import {
  DEFAULT_DISCLAIMER_EN,
  DEFAULT_PAYMENT_SETTINGS,
  FEE_PAYERS,
  FEE_TYPES,
  PROCESSING_FEE_PAYERS,
  parsePaymentSettings,
  type PaymentSettings,
  quotePayment,
} from './case-payments.settings';
import { payoutStatusOf } from './case-payments.service';

/** Owner 2026-10-05: the money split of a client → attorney payment. */
describe('case payments — settings and quote', () => {
  it('defaults: no platform fee, Stripe fee on the client, disclaimer text', () => {
    const s = parsePaymentSettings(null);
    expect(s.feeType).toBe('none');
    expect(s.processingFeePayer).toBe('client');
    expect(s.disclaimerEn).toBe(DEFAULT_DISCLAIMER_EN);
    expect(s.allowInvoices).toBe(true);
    expect(s.invoiceReminderDays).toEqual([3, 1]);
  });

  it('junk is replaced by defaults field by field; legacy boolean maps to the payer', () => {
    const s = parsePaymentSettings({
      feeType: 'percent',
      feeFixedCents: -5,
      passProcessingFeeToClient: false,
      minAmountCents: 100_000_000_000,
      maxAmountCents: 10,
      invoiceReminderDays: [3, 'x'],
      maxInstallments: 1,
    });
    expect(s.feeType).toBe('none');
    expect(s.feeFixedCents).toBe(0);
    expect(s.processingFeePayer).toBe('attorney');
    expect(s.minAmountCents).toBe(DEFAULT_PAYMENT_SETTINGS.minAmountCents);
    expect(s.maxAmountCents).toBeGreaterThanOrEqual(s.minAmountCents);
    expect(s.invoiceReminderDays).toEqual([3, 1]);
    expect(s.maxInstallments).toBe(12);
  });

  const base: PaymentSettings = {
    ...DEFAULT_PAYMENT_SETTINGS,
    processingFeePayer: 'attorney',
  };

  it('no fee: the client pays exactly the amount, the attorney nets it', () => {
    const q = quotePayment(50_000, base);
    expect(q.platformFeeCents).toBe(0);
    expect(q.processingFeeCents).toBe(0);
    expect(q.clientTotalCents).toBe(50_000);
    expect(q.attorneyNetCents).toBe(50_000);
    // Stripe takes 2.9 % + 30 ¢ from the attorney's balance.
    expect(q.stripeFeeEstimateCents).toBe(1480);
    expect(q.attorneyReceivesCents).toBe(48_520);
  });

  it('fixed fee paid by the client goes on top', () => {
    const q = quotePayment(50_000, {
      ...base,
      feeType: 'fixed',
      feeFixedCents: 500,
    });
    expect(q.platformFeeCents).toBe(500);
    expect(q.clientTotalCents).toBe(50_500);
    expect(q.attorneyNetCents).toBe(50_000);
  });

  it('fixed fee paid by the attorney is deducted and never exceeds the payment', () => {
    const q = quotePayment(50_000, {
      ...base,
      feeType: 'fixed',
      feeFixedCents: 500,
      feePayer: 'attorney',
    });
    expect(q.clientTotalCents).toBe(50_000);
    expect(q.attorneyNetCents).toBe(49_500);
    const tiny = quotePayment(100, {
      ...base,
      feeType: 'fixed',
      feeFixedCents: 500,
      feePayer: 'attorney',
    });
    expect(tiny.platformFeeCents).toBe(100);
    expect(tiny.attorneyNetCents).toBe(0);
  });

  it('Stripe fee on the client: grossed up so the attorney receives the full amount', () => {
    const q = quotePayment(50_000, { ...base, processingFeePayer: 'client' });
    // (50 000 + 30) / 0.971 = 51 524.2 → 51 525
    expect(q.clientTotalCents).toBe(51_525);
    expect(q.processingFeeCents).toBe(1525);
    expect(q.attorneyNetCents).toBe(50_000);
    expect(q.attorneyReceivesCents).toBeGreaterThanOrEqual(50_000);
  });

  it('Stripe fee split: the client covers half of the gross-up', () => {
    const q = quotePayment(50_000, { ...base, processingFeePayer: 'split' });
    expect(q.processingFeeCents).toBe(763);
    expect(q.clientTotalCents).toBe(50_763);
    expect(q.attorneyReceivesCents).toBeLessThan(50_000);
    expect(q.attorneyReceivesCents).toBeGreaterThan(48_520);
  });

  it('the Stripe rate is a setting: a tariff change needs no code', () => {
    const q = quotePayment(10_000, {
      ...base,
      processingFeePayer: 'client',
      processingFeePercent: 3.5,
      processingFeeFixedCents: 50,
    });
    // (10 000 + 50) / 0.965 = 10 414.5 → 10 415
    expect(q.clientTotalCents).toBe(10_415);
  });

  it('INVARIANT: the platform never pays — under every setting its balance only moves by the (non-negative) platform fee', () => {
    const amounts = [50, 500, 1234, 50_000, 2_500_000];
    for (const feeType of FEE_TYPES)
      for (const feePayer of FEE_PAYERS)
        for (const processingFeePayer of PROCESSING_FEE_PAYERS)
          for (const processingFeePercent of [0, 2.9, 3.5, 15])
            for (const amountCents of amounts) {
              const q = quotePayment(amountCents, {
                ...base,
                feeType,
                feeFixedCents: 700,
                feePayer,
                processingFeePayer,
                processingFeePercent,
              });
              // What the client pays covers the attorney's net and the
              // platform fee; the remainder is the Stripe share, which is
              // charged on the attorney's connected balance (direct charge).
              expect(q.platformFeeCents).toBeGreaterThanOrEqual(0);
              expect(q.attorneyNetCents).toBeGreaterThanOrEqual(0);
              expect(
                q.clientTotalCents - q.attorneyNetCents - q.platformFeeCents,
              ).toBe(q.processingFeeCents);
              expect(q.processingFeeCents).toBeGreaterThanOrEqual(0);
              expect(q.attorneyReceivesCents).toBeLessThanOrEqual(
                q.clientTotalCents - q.platformFeeCents,
              );
            }
  });

  it('maps Stripe account state to ours', () => {
    const a = {
      id: 'acct',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
      disabledReason: null,
      country: 'US',
    };
    expect(payoutStatusOf(a)).toBe('onboarding');
    expect(payoutStatusOf({ ...a, detailsSubmitted: true })).toBe('restricted');
    expect(
      payoutStatusOf({
        ...a,
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
      }),
    ).toBe('active');
    expect(payoutStatusOf({ ...a, disabledReason: 'rejected.fraud' })).toBe(
      'disabled',
    );
  });
});
