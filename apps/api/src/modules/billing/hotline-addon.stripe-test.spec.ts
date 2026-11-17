import Stripe from 'stripe';
import { proratedCents } from './hotline-addon.logic';
import { StripePaymentProvider } from './stripe-payment.provider';

/**
 * Owner row 87 (16.11, plan PR 8): the proof in Stripe TEST mode that one
 * subscription with several items (plan + assistant seats + «Горячая
 * линия») charges EXACT amounts. Runs only with a Stripe TEST key
 * (`STRIPE_TEST_SECRET_KEY=sk_test_…`, never a live key — it refuses one);
 * skipped in CI and everywhere else.
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_… npx jest hotline-addon.stripe-test
 *
 * A Stripe test clock freezes time so the proration is the same on every
 * run: subscribe ($399 plan + 1 seat × $100) → day 10: add the add-on ($49,
 * charged now for the rest of the period) → remove it (no refund, the next
 * invoice is without it) → day 12: 1 → 2 seats (charged now). Every invoice
 * is checked to the cent against Stripe's preview and our own proration;
 * the clock (and everything on it) is deleted at the end. The invoice ids
 * and amounts are printed as one `STRIPE_PROOF` line.
 */
const KEY = process.env.STRIPE_TEST_SECRET_KEY ?? '';
const run = KEY.startsWith('sk_test_') ? describe : describe.skip;

const DAY = 86_400;
const PLAN = 39_900;
const SEAT = 10_000;
const HOTLINE = 4_900;

run('Stripe TEST mode: hotline add-on + seats charge exact amounts', () => {
  jest.setTimeout(240_000);
  // Made only when the suite runs (describe.skip still runs this body).
  let stripe: Stripe;
  let provider: StripePaymentProvider;
  beforeAll(() => {
    stripe = new Stripe(KEY);
    provider = new StripePaymentProvider(KEY, undefined);
  });
  const tag = `lawbid-proof-${Date.now()}`;
  const proof: Record<string, unknown>[] = [];
  let clockId = '';

  async function advance(to: number): Promise<void> {
    await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });
    for (let i = 0; i < 60; i++) {
      const c = await stripe.testHelpers.testClocks.retrieve(clockId);
      if (c.status === 'ready') return;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    throw new Error('test clock did not finish advancing');
  }

  async function price(name: string, cents: number): Promise<string> {
    const p = await stripe.prices.create({
      currency: 'usd',
      unit_amount: cents,
      recurring: { interval: 'month' },
      tax_behavior: 'exclusive',
      product_data: { name: `${name} (${tag})` },
    });
    return p.id;
  }

  /** The renewal invoice Stripe would send next, in cents. */
  async function nextInvoiceCents(
    customer: string,
    subscription: string,
  ): Promise<number> {
    const inv = await stripe.invoices.createPreview({ customer, subscription });
    return inv.amount_due;
  }

  afterAll(async () => {
    if (clockId) {
      await stripe.testHelpers.testClocks.del(clockId).catch(() => undefined);
    }

    console.log(`STRIPE_PROOF ${JSON.stringify(proof)}`);
  });

  it('subscribe, add the add-on, remove it, change seats — every cent', async () => {
    const t0 = Math.floor(Date.now() / 1000) - 60;
    clockId = (
      await stripe.testHelpers.testClocks.create({ frozen_time: t0, name: tag })
    ).id;
    const [planPrice, seatPrice, hotlinePrice] = await Promise.all([
      price('LawBid plan', PLAN),
      price('LawBid Assistant seat', SEAT),
      price('LawBid Call hotline', HOTLINE),
    ]);
    const customer = await stripe.customers.create({
      test_clock: clockId,
      payment_method: 'pm_card_visa',
      invoice_settings: { default_payment_method: 'pm_card_visa' },
      metadata: { tag },
    });

    // 1. One subscription, two items: the plan and one seat.
    const sub = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [
          { price: planPrice, quantity: 1 },
          { price: seatPrice, quantity: 1 },
        ],
        expand: ['latest_invoice'],
      },
      { idempotencyKey: `${tag}:create` },
    );
    const first = sub.latest_invoice as Stripe.Invoice;
    expect(first.status).toBe('paid');
    expect(first.amount_paid).toBe(PLAN + SEAT);
    proof.push({
      step: 'subscribe',
      invoice: first.id,
      cents: first.amount_paid,
    });
    const item = sub.items.data[0] as Stripe.SubscriptionItem & {
      current_period_start: number;
      current_period_end: number;
    };
    const start = item.current_period_start;
    const end = item.current_period_end;

    // 2. Day 10: the add-on — «К оплате сейчас» is Stripe's own preview,
    // the charge is that very amount.
    const day10 = start + 10 * DAY;
    await advance(day10);
    const preview = await provider.previewSeatIncrease({
      subscriptionId: sub.id,
      seatPriceId: hotlinePrice,
      knownSeatPriceIds: [hotlinePrice],
      addSeats: 1,
      prorationDate: day10,
    });
    const expected = proratedCents(HOTLINE, 1, start, end, day10);
    expect(Math.abs(preview.amountNowCents - expected)).toBeLessThanOrEqual(1);
    const added = await provider.chargeSeatIncrease({
      subscriptionId: sub.id,
      seatPriceId: hotlinePrice,
      knownSeatPriceIds: [hotlinePrice],
      quantity: 1,
      prorationDate: day10,
      idempotencyKey: `${tag}:hotline-on`,
    });
    expect(added.status).toBe('applied');
    const addInvoice = await stripe.invoices.retrieve(added.invoiceId!);
    expect(addInvoice.status).toBe('paid');
    expect(addInvoice.amount_paid).toBe(preview.amountNowCents);
    // A retry with the same key is the same update — no second charge.
    const again = await provider.chargeSeatIncrease({
      subscriptionId: sub.id,
      seatPriceId: hotlinePrice,
      knownSeatPriceIds: [hotlinePrice],
      quantity: 1,
      prorationDate: day10,
      idempotencyKey: `${tag}:hotline-on`,
    });
    expect(again.invoiceId).toBe(added.invoiceId);
    expect(await nextInvoiceCents(customer.id, sub.id)).toBe(
      PLAN + SEAT + HOTLINE,
    );
    proof.push({
      step: 'hotline_on_day10',
      invoice: addInvoice.id,
      cents: addInvoice.amount_paid,
      ourProration: expected,
      nextInvoice: PLAN + SEAT + HOTLINE,
    });

    // 3. Off: no refund, no credit; the next invoice is without it.
    await provider.setSeatQuantity(
      sub.id,
      hotlinePrice,
      0,
      [hotlinePrice],
      'none',
    );
    expect(await nextInvoiceCents(customer.id, sub.id)).toBe(PLAN + SEAT);
    const credits = await stripe.invoiceItems.list({
      customer: customer.id,
      pending: true,
    });
    expect(credits.data).toHaveLength(0);
    proof.push({ step: 'hotline_off', nextInvoice: PLAN + SEAT, credits: 0 });

    // 4. Day 12: 1 → 2 seats, charged now the same way.
    const day12 = start + 12 * DAY;
    await advance(day12);
    const seatPreview = await provider.previewSeatIncrease({
      subscriptionId: sub.id,
      seatPriceId: seatPrice,
      knownSeatPriceIds: [seatPrice],
      addSeats: 1,
      prorationDate: day12,
    });
    const seatExpected = proratedCents(SEAT, 1, start, end, day12);
    expect(
      Math.abs(seatPreview.amountNowCents - seatExpected),
    ).toBeLessThanOrEqual(1);
    const seats = await provider.chargeSeatIncrease({
      subscriptionId: sub.id,
      seatPriceId: seatPrice,
      knownSeatPriceIds: [seatPrice],
      quantity: 2,
      prorationDate: day12,
      idempotencyKey: `${tag}:seats-2`,
    });
    expect(seats.status).toBe('applied');
    const seatInvoice = await stripe.invoices.retrieve(seats.invoiceId!);
    expect(seatInvoice.amount_paid).toBe(seatPreview.amountNowCents);
    expect(await nextInvoiceCents(customer.id, sub.id)).toBe(PLAN + 2 * SEAT);
    proof.push({
      step: 'seats_1_to_2_day12',
      invoice: seatInvoice.id,
      cents: seatInvoice.amount_paid,
      ourProration: seatExpected,
      nextInvoice: PLAN + 2 * SEAT,
    });

    // 5. The renewal: exactly plan + 2 seats, the add-on gone.
    await advance(end + 2 * 3600);
    const invoices = await stripe.invoices.list({
      customer: customer.id,
      limit: 10,
    });
    const renewal = invoices.data.find(
      (i) => i.billing_reason === 'subscription_cycle',
    );
    expect(renewal?.amount_due).toBe(PLAN + 2 * SEAT);
    proof.push({
      step: 'renewal',
      invoice: renewal?.id,
      cents: renewal?.amount_due,
    });
  });
});
