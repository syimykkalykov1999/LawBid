import {
  proratedCents,
  SubscriptionAdminService,
} from './subscription-admin.service';

describe('proratedCents', () => {
  const start = new Date('2026-10-01T00:00:00Z');
  const end = new Date('2026-10-31T00:00:00Z');

  it('refunds the unused share of the period', () => {
    const mid = new Date('2026-10-16T00:00:00Z').getTime();
    expect(proratedCents(30_000, start, end, mid)).toBe(15_000);
  });

  it('is the whole amount before the period and nothing after it', () => {
    expect(proratedCents(30_000, start, end, start.getTime() - 1000)).toBe(
      30_000,
    );
    expect(proratedCents(30_000, start, end, end.getTime() + 1000)).toBe(0);
  });

  it('is nothing without a period', () => {
    expect(proratedCents(30_000, null, end)).toBe(0);
    expect(proratedCents(30_000, end, start)).toBe(0);
  });
});

/** Algo audit 2026-10-27 (MONEY H-4): which payment «cancel with refund» uses. */
describe('SubscriptionAdminService.lastSubscriptionPayment', () => {
  const pay = (id: string, invoice: string | null, cents = 39_900) => ({
    id,
    stripe_invoice_id: invoice,
    amount_cents: cents,
  });

  function setup(opts: {
    candidates: ReturnType<typeof pay>[];
    seatInvoices?: string[];
    latest?: string | null;
    strict?: boolean;
  }) {
    const prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue(opts.candidates),
        findFirst: jest.fn().mockResolvedValue(pay('legacy', null, 1_500)),
      },
      assistantSeatChange: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            (opts.seatInvoices ?? []).map((i) => ({ stripe_invoice_id: i })),
          ),
      },
    };
    const provider = {
      retrieveSubscription: jest
        .fn()
        .mockResolvedValue({ latestInvoiceId: opts.latest ?? null }),
    };
    const settings = {
      boolean: jest.fn().mockResolvedValue(opts.strict ?? true),
    };
    const svc = new SubscriptionAdminService(
      prisma as never,
      provider as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      settings as never,
    );
    const row = {
      user_id: 'att-1',
      stripe_subscription_id: 'sub_1',
    } as never;
    return { svc, prisma, row };
  }

  it('asks only for paid subscription invoices above $0', async () => {
    const h = setup({ candidates: [pay('p1', 'in_1')] });
    await h.svc.lastSubscriptionPayment(h.row);
    expect(h.prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: 'att-1',
          status: 'succeeded',
          stripe_invoice_id: { not: null },
          amount_cents: { gt: 0 },
        },
      }),
    );
  });

  it('skips a seat-purchase invoice and prefers the latest renewal Stripe names', async () => {
    const h = setup({
      candidates: [
        pay('seat', 'in_s', 5_000),
        pay('p2', 'in_2'),
        pay('p1', 'in_1'),
      ],
      seatInvoices: ['in_s'],
      latest: 'in_1',
    });
    expect((await h.svc.lastSubscriptionPayment(h.row))?.id).toBe('p1');
    const h2 = setup({
      candidates: [pay('seat', 'in_s', 5_000), pay('p2', 'in_2')],
      seatInvoices: ['in_s'],
    });
    expect((await h2.svc.lastSubscriptionPayment(h2.row))?.id).toBe('p2');
  });

  it('nothing to refund without a subscription invoice; switch off = old pick', async () => {
    const h = setup({ candidates: [] });
    expect(await h.svc.lastSubscriptionPayment(h.row)).toBeNull();
    const old = setup({ candidates: [], strict: false });
    expect((await old.svc.lastSubscriptionPayment(old.row))?.id).toBe('legacy');
  });
});
