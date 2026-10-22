import { StripePaymentProvider } from './stripe-payment.provider';

/**
 * Owner 2026-10-22: the Stripe calls behind seats — preview with
 * `always_invoice` at the proration date, the purchase with
 * `pending_if_incomplete`, 3-D Secure / decline outcomes, a removal with
 * `proration_behavior: none`, and the seat item read back.
 */
describe('StripePaymentProvider seats', () => {
  const sub = (seatQty: number | null, pending = false) => ({
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    default_payment_method: null,
    metadata: {},
    latest_invoice: 'in_9',
    pending_update: pending ? { expires_at: 123 } : null,
    items: {
      data: [
        {
          id: 'si_plan',
          quantity: 1,
          price: { id: 'price_plan', unit_amount: 39_900 },
          current_period_start: 1_000,
          current_period_end: 2_000,
        },
        ...(seatQty == null
          ? []
          : [
              {
                id: 'si_seat',
                quantity: seatQty,
                price: { id: 'price_seat_old', unit_amount: 10_000 },
              },
            ]),
      ],
    },
  });

  function make(stripe: Record<string, unknown>) {
    const p = new StripePaymentProvider('sk_test_x', undefined);
    (p as unknown as { stripe: unknown }).stripe = stripe;
    return p;
  }

  it('previews the added seats at the proration date (always_invoice)', async () => {
    const createPreview = jest.fn().mockResolvedValue({
      amount_due: 3_300,
      currency: 'usd',
      lines: {
        data: [
          {
            amount: 3_300,
            parent: { subscription_item_details: { proration: true } },
          },
        ],
      },
    });
    const p = make({
      subscriptions: { retrieve: jest.fn().mockResolvedValue(sub(1)) },
      invoices: { createPreview },
    });
    const r = await p.previewSeatIncrease({
      subscriptionId: 'sub_1',
      seatPriceId: 'price_seat',
      knownSeatPriceIds: ['price_seat_old'],
      addSeats: 2,
      prorationDate: 1_500,
    });
    expect(createPreview).toHaveBeenCalledWith({
      customer: 'cus_1',
      subscription: 'sub_1',
      subscription_details: {
        items: [{ id: 'si_seat', quantity: 3 }],
        proration_behavior: 'always_invoice',
        proration_date: 1_500,
      },
    });
    expect(r).toEqual({
      amountNowCents: 3_300,
      currency: 'usd',
      prorationDate: 1_500,
      periodEnd: 2_000,
    });
  });

  it('counts only proration lines when the preview holds the renewal too', async () => {
    const p = make({
      subscriptions: { retrieve: jest.fn().mockResolvedValue(sub(null)) },
      invoices: {
        createPreview: jest.fn().mockResolvedValue({
          amount_due: 50_000,
          currency: 'usd',
          lines: {
            data: [
              {
                amount: 1_200,
                parent: { subscription_item_details: { proration: true } },
              },
              {
                amount: 48_800,
                parent: { subscription_item_details: { proration: false } },
              },
            ],
          },
        }),
      },
    });
    const r = await p.previewSeatIncrease({
      subscriptionId: 'sub_1',
      seatPriceId: 'price_seat',
      addSeats: 1,
      prorationDate: 1_500,
    });
    expect(r.amountNowCents).toBe(1_200);
  });

  function chargeSetup(opts: {
    pending: boolean;
    invoiceStatus: string;
    intentStatus?: string;
  }) {
    const update = jest.fn().mockResolvedValue(sub(3, opts.pending));
    const voidInvoice = jest.fn().mockResolvedValue({});
    const stripe = {
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue(sub(1)),
        update,
      },
      invoices: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'in_9',
          amount_due: 3_300,
          currency: 'usd',
          status: opts.invoiceStatus,
          confirmation_secret: { client_secret: 'cs_inv' },
          payments: {
            data: [{ payment: { payment_intent: 'pi_1' } }],
          },
        }),
        voidInvoice,
      },
      paymentIntents: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'pi_1',
          status: opts.intentStatus ?? 'requires_payment_method',
          client_secret: 'pi_1_secret',
        }),
      },
    };
    return { p: make(stripe), update, voidInvoice };
  }

  const charge = (p: StripePaymentProvider) =>
    p.chargeSeatIncrease({
      subscriptionId: 'sub_1',
      seatPriceId: 'price_seat',
      knownSeatPriceIds: ['price_seat_old'],
      quantity: 3,
      prorationDate: 1_500,
      idempotencyKey: 'k1',
    });

  it('charges now with pending_if_incomplete; paid = applied', async () => {
    const { p, update } = chargeSetup({
      pending: false,
      invoiceStatus: 'paid',
    });
    const r = await charge(p);
    expect(update).toHaveBeenCalledWith(
      'sub_1',
      {
        items: [{ id: 'si_seat', quantity: 3 }],
        proration_behavior: 'always_invoice',
        proration_date: 1_500,
        payment_behavior: 'pending_if_incomplete',
      },
      { idempotencyKey: 'k1' },
    );
    expect(r).toMatchObject({
      status: 'applied',
      invoiceId: 'in_9',
      amountCents: 3_300,
      clientSecret: null,
    });
    expect(r.subscription.items).toContainEqual({
      priceId: 'price_seat_old',
      quantity: 3,
      unitAmountCents: 10_000,
    });
  });

  it('3-D Secure: requires_action with the PaymentIntent secret', async () => {
    const { p, voidInvoice } = chargeSetup({
      pending: true,
      invoiceStatus: 'open',
      intentStatus: 'requires_action',
    });
    const r = await charge(p);
    expect(r).toMatchObject({
      status: 'requires_action',
      clientSecret: 'pi_1_secret',
    });
    expect(voidInvoice).not.toHaveBeenCalled();
  });

  it('declined: failed and the invoice voided (nothing changes)', async () => {
    const { p, voidInvoice } = chargeSetup({
      pending: true,
      invoiceStatus: 'open',
    });
    const r = await charge(p);
    expect(r.status).toBe('failed');
    expect(voidInvoice).toHaveBeenCalledWith('in_9');
  });

  it('a removal lowers the quantity with no proration (no refund)', async () => {
    const update = jest.fn().mockResolvedValue(sub(0));
    const p = make({
      subscriptions: { retrieve: jest.fn().mockResolvedValue(sub(2)), update },
    });
    await p.setSeatQuantity(
      'sub_1',
      'price_seat',
      1,
      ['price_seat_old'],
      'none',
    );
    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_seat', quantity: 1 }],
      proration_behavior: 'none',
    });
  });
});
