import { SubscriptionsService } from './subscriptions.service';
import type { ProviderSubscription } from './payment-provider';

/**
 * Verify 17.11 (batch 6, seat limit on the billing path): the assistants
 * named at purchase are added by the checkout webhook / the in-app confirm
 * (`applyOrder`). They take the same per-attorney lock as «Add assistant»
 * (`AssistantsService.add`: pg_advisory_xact_lock(hashtext(
 * 'assistant-seats:<attorneyId>')) in the transaction that counts and
 * creates the seat), so the two can no longer both take the last seat.
 */
const OWNER = 'att-1';

function setup(opts: { used: number; seats: number; phones: string }) {
  const order: string[] = [];
  const txOptions: unknown[] = [];
  const tx = {
    $executeRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        order.push(`raw:${strings.join('?')}:${values.join(',')}`);
        return Promise.resolve(1);
      },
    ),
    assistantMembership: {
      findFirst: jest.fn(() => {
        order.push('phone-check');
        return Promise.resolve(null);
      }),
      count: jest.fn(() => {
        order.push('count');
        return Promise.resolve(opts.used);
      }),
      create: jest.fn(() => {
        order.push('create');
        return Promise.resolve({ id: 'm-new' });
      }),
    },
  };
  const prisma = {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(
      (fn: (t: typeof tx) => Promise<unknown>, o: unknown) => {
        txOptions.push(o);
        return fn(tx);
      },
    ),
  };
  const svc = Object.create(SubscriptionsService.prototype) as Record<
    string,
    unknown
  >;
  svc.prisma = prisma;
  svc.provider = {};
  svc.sync = { apply: jest.fn().mockResolvedValue(null) };
  svc.access = { invalidate: jest.fn().mockResolvedValue(undefined) };
  svc.entitlements = {
    seats: jest.fn().mockResolvedValue({ total: opts.seats }),
  };
  svc.plans = { byId: jest.fn() };
  svc.cardTrialEligible = jest.fn().mockResolvedValue(true);
  svc.logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
  const remote = {
    id: 'sub_1',
    status: 'active',
    customerId: 'cus_1',
    defaultPaymentMethodId: null,
  } as unknown as ProviderSubscription;
  const run = () =>
    (
      svc as unknown as {
        applyOrder: (...a: unknown[]) => Promise<void>;
      }
    ).applyOrder(
      remote,
      {
        plan: 'monthly',
        seats: String(opts.seats),
        priceCents: '9900',
        phones: opts.phones,
      },
      OWNER,
    );
  return { run, tx, order, txOptions };
}

describe('SubscriptionsService.applyOrder purchase-time assistants (seat lock)', () => {
  it('takes the «assistant-seats:<attorney>» lock in the tx before it counts and creates', async () => {
    const { run, tx, order, txOptions } = setup({
      used: 0,
      seats: 2,
      phones: '+13125550101',
    });
    await run();
    // Final pass 18.11 (FB3): the SAME lock key as «Add assistant» and a
    // seat decrease (lockAssistantSeats); hashtext() was another key, so
    // the two never waited for each other.
    expect(order[0]).toBe(
      'raw:SELECT pg_advisory_xact_lock(hashtextextended(?, 0)):assistant-seats:att-1',
    );
    expect(order.indexOf('count')).toBeGreaterThan(0);
    expect(order.indexOf('create')).toBeGreaterThan(order.indexOf('count'));
    expect(tx.assistantMembership.create).toHaveBeenCalledTimes(1);
    // The lock serializes; read committed lets the count after it see a
    // seat an «Add assistant» committed while this one waited.
    expect(txOptions[0]).toMatchObject({ isolationLevel: 'ReadCommitted' });
  });

  it('a parallel «Add assistant» that took the last seat first: the purchase adds no seat past the paid number', async () => {
    const { run, tx } = setup({
      used: 2,
      seats: 2,
      phones: '+13125550101',
    });
    await run();
    expect(tx.assistantMembership.create).not.toHaveBeenCalled();
  });
});
