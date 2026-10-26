import { FakePaymentProvider } from './fake-payment.provider';
import {
  checkoutOf,
  oneTimePayPageSession,
  savedCardOf,
  type OneTimeRow,
} from './one-time-pay-page';

/**
 * Owner 2026-10-22 («лечи всё»): stars and offer packs are paid on our card
 * page (a PaymentIntent per purchase); client plans and the gold badge save
 * a card there (SetupIntent) and the subscription is made on it.
 */
describe('one-time purchases on the card page', () => {
  function setup(row: Partial<OneTimeRow> = {}) {
    const provider = new FakePaymentProvider();
    let current: OneTimeRow = {
      id: 'buy1',
      user_id: 'u1',
      status: 'pending_payment',
      price_cents: 499,
      stripe_checkout_id: null,
      ...row,
    };
    const applied: string[] = [];
    const run = () =>
      oneTimePayPageSession({
        provider,
        row: current,
        userId: 'u1',
        kind: 'stars',
        description: 'LawBid — 100 stars',
        save: (pi) => {
          current = { ...current, stripe_checkout_id: pi };
          return Promise.resolve();
        },
        apply: (s) => {
          applied.push(s.id);
          current = { ...current, status: 'paid' };
          return Promise.resolve(true);
        },
      });
    const set = (r: Partial<OneTimeRow>) => (current = { ...current, ...r });
    return { provider, run, applied, row: () => current, set };
  }

  it('one PaymentIntent per purchase, reused when the page reopens', async () => {
    const s = setup();
    const a = await s.run();
    expect(a).toMatchObject({ paid: false, amountCents: 499 });
    const id = s.row().stripe_checkout_id!;
    expect(id).toMatch(/^fake_pi_/);
    const pi = await s.provider.retrievePaymentIntent(id);
    expect(pi?.metadata).toEqual({
      kind: 'stars',
      purchaseId: 'buy1',
      userId: 'u1',
    });
    const b = await s.run();
    expect(b.clientSecret).toBe(a.clientSecret);
    expect(s.row().stripe_checkout_id).toBe(id);
  });

  it('paid meanwhile → applied once, the page shows success', async () => {
    const s = setup();
    await s.run();
    s.provider.payPaymentIntent(s.row().stripe_checkout_id!);
    expect((await s.run()).paid).toBe(true);
    expect(s.applied).toHaveLength(1);
    expect((await checkoutOf(s.provider, s.applied[0]))?.status).toBe(
      'complete',
    );
  });

  it("someone else's or a cancelled purchase is refused", async () => {
    await expect(setup({ user_id: 'u2' }).run()).rejects.toThrow(
      'No such purchase.',
    );
    await expect(setup({ status: 'canceled' }).run()).rejects.toThrow(
      /cancelled/,
    );
  });

  it("an old Stripe hosted session is closed before the page's intent", async () => {
    const s = setup();
    const old = await s.provider.createOneTimeCheckout({
      amountCents: 499,
      description: 'x',
      metadata: { kind: 'stars', purchaseId: 'buy1' },
      successUrl: 'https://x/s',
      cancelUrl: 'https://x/c',
    });
    s.set({ stripe_checkout_id: old.id });
    const r = await s.run();
    expect(r.paid).toBe(false);
    expect((await s.provider.retrieveCheckoutSession(old.id))?.status).toBe(
      'expired',
    );
    expect(s.row().stripe_checkout_id).toMatch(/^fake_pi_/);
  });

  it('savedCardOf: only a succeeded SetupIntent of this customer', async () => {
    const provider = new FakePaymentProvider();
    const cus = await provider.createCustomer({ userId: 'u1' });
    const si = await provider.createSetupIntent(cus, { kind: 'client_plan' });
    await expect(savedCardOf(provider, cus, si.id)).rejects.toThrow(
      'The card was not saved.',
    );
    provider.confirmSetupIntent(si.id, {
      paymentMethodId: 'pm_1',
      fingerprint: 'fp1',
    });
    await expect(savedCardOf(provider, cus, si.id)).resolves.toBe('pm_1');
    await expect(savedCardOf(provider, 'cus_other', si.id)).rejects.toThrow(
      'The card was not saved.',
    );
  });
});
