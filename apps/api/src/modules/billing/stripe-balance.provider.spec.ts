import { StripePaymentProvider } from './stripe-payment.provider';

/**
 * Verify 8 (RF1): the referral credit and its reversal on the Stripe
 * customer balance — a credit is a negative balance transaction, the
 * reversal a positive one (a debit) of the same amount, under its own
 * idempotency key and naming the credit it reverses.
 */
describe('StripePaymentProvider customer balance', () => {
  function make() {
    const createBalanceTransaction = jest.fn().mockResolvedValue({});
    const p = new StripePaymentProvider('sk_test_x', undefined);
    (p as unknown as { stripe: unknown }).stripe = {
      customers: { createBalanceTransaction },
    };
    return { p, createBalanceTransaction };
  }

  it('a credit is negative, its reversal positive with the reversal key', async () => {
    const { p, createBalanceTransaction } = make();
    await p.creditCustomerBalance(
      'cus_1',
      10_000,
      'reward',
      'referral-reward:r1:referrer',
    );
    await p.debitCustomerBalance(
      'cus_1',
      10_000,
      'reversed',
      'ref-reverse:r1:referrer',
      {
        reversal_of: 'referral-reward:r1:referrer',
      },
    );
    expect(createBalanceTransaction).toHaveBeenNthCalledWith(
      1,
      'cus_1',
      { amount: -10_000, currency: 'usd', description: 'reward' },
      { idempotencyKey: 'referral-reward:r1:referrer' },
    );
    expect(createBalanceTransaction).toHaveBeenNthCalledWith(
      2,
      'cus_1',
      {
        amount: 10_000,
        currency: 'usd',
        description: 'reversed',
        metadata: { reversal_of: 'referral-reward:r1:referrer' },
      },
      { idempotencyKey: 'ref-reverse:r1:referrer' },
    );
  });
});
