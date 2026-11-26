import { FakePaymentProvider } from '../billing/fake-payment.provider';
import { CasePaymentsService } from './case-payments.service';

/**
 * THIRD_PASS_A I5 (26.11): two first payments of one client to one attorney
 * at the same time. Before: both missed the row, both created a Stripe
 * customer without a key, and each returned ITS OWN id, so the loser's
 * payment and saved card went to an orphan customer. Now the create carries
 * an idempotency key and the stored row's id is returned.
 */
describe('CasePaymentsService.connectedCustomer (I5)', () => {
  type Row = { stripe_customer_id: string };
  type ConnectedCustomerFn = (
    clientId: string,
    accountId: string,
    email: string | null,
    name: string | null,
  ) => Promise<string | null>;

  function setup(provider: object) {
    let stored: Row | null = null;
    const upsert = jest.fn(
      (args: { create: Row & Record<string, string> }): Promise<Row> => {
        // update: {} → the first stored row wins.
        stored ??= { stripe_customer_id: args.create.stripe_customer_id };
        return Promise.resolve(stored);
      },
    );
    const svc = Object.create(CasePaymentsService.prototype) as Record<
      string,
      unknown
    >;
    Object.assign(svc, {
      provider,
      prisma: {
        connectedCustomer: {
          findUnique: jest.fn(() => Promise.resolve(null)), // both race past it
          upsert,
        },
      },
      logger: { warn: jest.fn() },
    });
    const call = (svc.connectedCustomer as ConnectedCustomerFn).bind(svc);
    return { call, upsert };
  }

  it('sends an idempotency key per (client, account)', async () => {
    const ensure = jest.fn(() => Promise.resolve('cus_1'));
    const { call } = setup({ ensureConnectedCustomer: ensure });
    await call('client-1', 'acct_1', 'a@b.c', 'A');
    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct_1',
        idempotencyKey: 'conn-cust:client-1:acct_1',
      }),
    );
  });

  it('returns the stored winner, never its own new id', async () => {
    let n = 0;
    // A provider without idempotency (the worst case): two different ids.
    const ensure = jest.fn(() => Promise.resolve(`cus_${++n}`));
    const { call } = setup({ ensureConnectedCustomer: ensure });
    const [a, b] = await Promise.all([
      call('client-1', 'acct_1', null, null),
      call('client-1', 'acct_1', null, null),
    ]);
    expect(a).toBe('cus_1');
    expect(b).toBe('cus_1');
  });

  it('with the fake provider (keyed like Stripe) only one customer exists', async () => {
    const fake = new FakePaymentProvider();
    const acct = await fake.createConnectAccount({
      userId: 'attorney-9',
      email: null,
      country: 'US',
    });
    const { call } = setup(fake);
    const [a, b] = await Promise.all([
      call('client-9', acct, null, null),
      call('client-9', acct, null, null),
    ]);
    expect(a).toBe(b);
    expect(
      fake.connectedCustomers.filter((x) => x.accountId === acct),
    ).toHaveLength(1);
  });
});
