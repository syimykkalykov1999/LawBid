import { StripePaymentProvider } from './stripe-payment.provider';

/**
 * Owner 2026-10-22 (systems checklist §12): Stripe Tax — `automatic_tax`
 * goes on subscriptions, seat previews/purchases, the yearly switch and
 * hosted checkouts only when the admin switch asks AND the customer has a
 * recognised tax location; prices carry `tax_behavior: exclusive`; the
 * card page computes tax with the Tax Calculation API; invoices report
 * their tax.
 */
describe('StripePaymentProvider — Stripe Tax', () => {
  const customer = (status: string | null) => ({
    id: 'cus_1',
    deleted: false,
    tax: status ? { automatic_tax: status } : undefined,
  });
  const sub = () => ({
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    default_payment_method: null,
    metadata: {},
    latest_invoice: null,
    pending_update: null,
    items: {
      data: [
        {
          id: 'si_plan',
          quantity: 1,
          price: { id: 'price_plan', unit_amount: 39_900 },
          current_period_start: 1_000,
          current_period_end: 2_000,
        },
      ],
    },
  });

  function make(stripe: Record<string, unknown>) {
    const p = new StripePaymentProvider('sk_test_x', undefined);
    (p as unknown as { stripe: unknown }).stripe = stripe;
    return p;
  }

  const subInput = {
    customerId: 'cus_1',
    priceId: 'price_plan',
    paymentMethodId: 'pm_1',
    trialDays: null,
    metadata: { userId: 'u1' },
    idempotencyKey: 'k1',
  };

  it('subscription: automatic_tax only with the switch and a placed customer', async () => {
    const create = jest.fn().mockResolvedValue(sub());
    const retrieve = jest.fn().mockResolvedValue(customer('supported'));
    const p = make({ subscriptions: { create }, customers: { retrieve } });
    await p.createSubscription({ ...subInput, automaticTax: true });
    expect(create.mock.calls[0][0]).toMatchObject({
      automatic_tax: { enabled: true },
    });
    // Switch off: Stripe is not even asked about the customer.
    await p.createSubscription(subInput);
    expect(create.mock.calls[1][0]).not.toHaveProperty('automatic_tax');
    expect(retrieve).toHaveBeenCalledTimes(1);
    // Switch on but the customer cannot be placed: no automatic_tax
    // (Stripe would refuse the subscription otherwise).
    retrieve.mockResolvedValue(customer('unrecognized_location'));
    await p.createSubscription({ ...subInput, automaticTax: true });
    expect(create.mock.calls[2][0]).not.toHaveProperty('automatic_tax');
  });

  it('customer: address / IP go to Stripe; the tax status is read back', async () => {
    const update = jest.fn().mockResolvedValue({});
    const createC = jest.fn().mockResolvedValue({ id: 'cus_1' });
    const retrieve = jest.fn().mockResolvedValue(customer(null));
    const p = make({ customers: { update, create: createC, retrieve } });
    await p.updateCustomerTaxLocation('cus_1', {
      address: { country: 'US', postalCode: '94105', state: 'CA' },
      ip: '203.0.113.9',
    });
    expect(update).toHaveBeenCalledWith('cus_1', {
      address: { country: 'US', postal_code: '94105', state: 'CA' },
      tax: { ip_address: '203.0.113.9' },
    });
    await p.updateCustomerTaxLocation('cus_1', {});
    expect(update).toHaveBeenCalledTimes(1);
    await p.createCustomer({
      userId: 'u1',
      email: 'a@b.c',
      tax: { ip: '203.0.113.9' },
    });
    expect(createC.mock.calls[0][0]).toMatchObject({
      tax: { ip_address: '203.0.113.9' },
    });
    expect(await p.customerTaxSupported('cus_1')).toBe(false);
  });

  it('seats: the preview carries the tax; the purchase and the yearly switch pass automatic_tax', async () => {
    const createPreview = jest.fn().mockResolvedValue({
      amount_due: 1_085,
      currency: 'usd',
      total_taxes: [{ amount: 85 }],
      lines: { data: [] },
    });
    const update = jest.fn().mockResolvedValue(sub());
    const p = make({
      subscriptions: { retrieve: jest.fn().mockResolvedValue(sub()), update },
      customers: {
        retrieve: jest.fn().mockResolvedValue(customer('supported')),
      },
      invoices: { createPreview },
    });
    const r = await p.previewSeatIncrease({
      subscriptionId: 'sub_1',
      seatPriceId: 'price_seat',
      addSeats: 1,
      prorationDate: 1_500,
      automaticTax: true,
    });
    expect(createPreview.mock.calls[0][0]).toMatchObject({
      automatic_tax: { enabled: true },
    });
    expect(r).toMatchObject({ amountNowCents: 1_085, taxCents: 85 });

    await p.switchToYearly('sub_1', 'price_year', true);
    expect(update.mock.calls[0][1]).toMatchObject({
      automatic_tax: { enabled: true },
    });
  });

  it('hosted checkouts collect the address and add the tax; a new price is tax-exclusive', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'cs_1',
      url: 'https://checkout',
      status: 'open',
      metadata: {},
    });
    const prices = {
      create: jest.fn().mockResolvedValue({ id: 'price_1', product: 'prod_1' }),
    };
    const p = make({ checkout: { sessions: { create } }, prices });
    await p.createCheckoutSession({
      customerId: 'cus_1',
      lineItems: [{ priceId: 'price_plan', quantity: 1 }],
      trialDays: null,
      successUrl: 'https://x/s',
      cancelUrl: 'https://x/c',
      metadata: { userId: 'u1' },
      automaticTax: true,
    });
    expect(create.mock.calls[0][0]).toMatchObject({
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
    });
    await p.createOneTimeCheckout({
      amountCents: 5_000,
      description: 'Boost',
      metadata: { userId: 'u1' },
      successUrl: 'https://x/s',
      cancelUrl: 'https://x/c',
      automaticTax: true,
    });
    expect(create.mock.calls[1][0]).toMatchObject({
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
    });
    expect(create.mock.calls[1][0].line_items[0].price_data.tax_behavior).toBe(
      'exclusive',
    );
    await p.createPrice({
      currency: 'usd',
      amountCents: 39_900,
      interval: 'month',
      metadata: {},
      productId: 'prod_1',
      productFromPriceId: null,
      productName: 'Plan',
      idempotencyKey: 'p1',
    });
    expect(prices.create.mock.calls[0][0]).toMatchObject({
      tax_behavior: 'exclusive',
    });
  });

  it('card page: a Tax calculation at the address / IP, then the transaction', async () => {
    const calculations = {
      create: jest.fn().mockResolvedValue({
        id: 'taxcalc_1',
        amount_total: 5_413,
        tax_amount_exclusive: 413,
        currency: 'usd',
      }),
    };
    const transactions = {
      createFromCalculation: jest.fn().mockResolvedValue({ id: 'tax_1' }),
    };
    const paymentIntents = {
      update: jest.fn().mockResolvedValue({
        id: 'pi_1',
        status: 'requires_payment_method',
        amount: 5_413,
        currency: 'usd',
        client_secret: 'pi_1_secret',
        metadata: { taxCalculationId: 'taxcalc_1' },
      }),
    };
    const p = make({ tax: { calculations, transactions }, paymentIntents });
    const calc = await p.calculateTax({
      amountCents: 5_000,
      currency: 'usd',
      reference: 'pi_1',
      location: {
        address: { country: 'US', postalCode: '94105' },
        ip: '203.0.113.9',
      },
    });
    expect(calculations.create).toHaveBeenCalledWith({
      currency: 'usd',
      line_items: [
        { amount: 5_000, reference: 'pi_1', tax_behavior: 'exclusive' },
      ],
      customer_details: {
        address: { country: 'US', postal_code: '94105' },
        address_source: 'billing',
        ip_address: '203.0.113.9',
      },
    });
    expect(calc).toEqual({
      calculationId: 'taxcalc_1',
      subtotalCents: 5_000,
      taxCents: 413,
      totalCents: 5_413,
      currency: 'usd',
    });
    const updated = await p.updatePaymentIntent('pi_1', {
      amountCents: 5_413,
      metadata: { taxCalculationId: 'taxcalc_1', taxCents: '413' },
    });
    expect(updated.amountCents).toBe(5_413);
    expect(await p.recordTaxTransaction('taxcalc_1', 'pi_1')).toBe('tax_1');
    expect(transactions.createFromCalculation).toHaveBeenCalledWith(
      { calculation: 'taxcalc_1', reference: 'pi_1' },
      { idempotencyKey: 'tax-tx:pi_1' },
    );
  });

  it('invoices report their tax (total_taxes, or the legacy tax field)', async () => {
    const retrieve = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'in_1',
        customer: 'cus_1',
        amount_paid: 1_085,
        amount_due: 1_085,
        subtotal: 1_000,
        currency: 'usd',
        status: 'paid',
        total_taxes: [{ amount: 60 }, { amount: 25 }],
        status_transitions: { paid_at: 1 },
      })
      .mockResolvedValueOnce({
        id: 'in_2',
        customer: 'cus_1',
        amount_paid: 1_000,
        amount_due: 1_000,
        subtotal: 1_000,
        currency: 'usd',
        status: 'paid',
        tax: null,
        status_transitions: { paid_at: 1 },
      });
    const p = make({ invoices: { retrieve } });
    expect(await p.retrieveInvoice('in_1')).toMatchObject({
      amountCents: 1_085,
      taxCents: 85,
      subtotalCents: 1_000,
    });
    expect(await p.retrieveInvoice('in_2')).toMatchObject({
      taxCents: null,
      subtotalCents: 1_000,
    });
  });
});
