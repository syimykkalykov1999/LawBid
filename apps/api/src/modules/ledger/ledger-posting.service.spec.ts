import { LedgerPostingService } from './ledger-posting.service';
import type { LedgerService } from './ledger.service';
import type { Line } from './ledger.recipes';

/**
 * Verify 17.11 (batch 9): Stripe Tax reports the tax of a one-time payment
 * after it was booked (a separate `tax` entry moves it from revenue to
 * tax_payable). A refund reversed only the `paid` entry: revenue went
 * negative by the tax and tax_payable kept owing tax on a refunded sale.
 */
describe('LedgerPostingService.paymentRefunded — the tax moved out is reversed too', () => {
  function setup() {
    const entries: Record<
      string,
      { currency: string; lines: Line[]; grossCents: number }
    > = {
      paid: {
        currency: 'usd',
        grossCents: 10_800,
        lines: [
          {
            account: { code: 'stripe_platform_balance' },
            direction: 'debit',
            cents: 10_800,
          },
          {
            account: { code: 'revenue_promotions' },
            direction: 'credit',
            cents: 10_800,
          },
        ],
      },
      tax: {
        currency: 'usd',
        grossCents: 800,
        lines: [
          {
            account: { code: 'revenue_promotions' },
            direction: 'debit',
            cents: 800,
          },
          { account: { code: 'tax_payable' }, direction: 'credit', cents: 800 },
        ],
      },
    };
    const posted: { lines: Line[] }[] = [];
    const ledger = {
      linesOf: jest.fn((_db: unknown, key: { event: string }) =>
        Promise.resolve(entries[key.event] ?? null),
      ),
      post: jest.fn((_db: unknown, e: { lines: Line[] }) => {
        posted.push(e);
        return Promise.resolve({ created: true });
      }),
    } as unknown as LedgerService;
    return { svc: new LedgerPostingService(ledger), posted };
  }

  const net = (lines: Line[], code: string) =>
    lines
      .filter((l) => l.account.code === code)
      .reduce((s, l) => s + (l.direction === 'debit' ? l.cents : -l.cents), 0);

  it('a full refund of a taxed payment leaves revenue and tax_payable at zero', async () => {
    const h = setup();
    await h.svc.paymentRefunded({} as never, {
      paymentId: 'pay-1',
      refundId: 'r1',
      cents: 10_800,
      userId: 'u1',
    });
    const lines = h.posted[0].lines;
    // paid + tax: revenue credit 10 000 net, tax_payable credit 800.
    expect(net(lines, 'revenue_promotions')).toBe(10_000);
    expect(net(lines, 'tax_payable')).toBe(800);
    expect(net(lines, 'stripe_platform_balance')).toBe(-10_800);
  });

  it('without a tax entry the refund mirrors the paid entry as before', async () => {
    const h = setup();
    (
      h.svc as unknown as { ledger: { linesOf: jest.Mock } }
    ).ledger.linesOf.mockImplementation(
      (_db: unknown, key: { event: string }) =>
        Promise.resolve(
          key.event === 'paid'
            ? {
                currency: 'usd',
                grossCents: 1000,
                lines: [
                  {
                    account: { code: 'stripe_platform_balance' },
                    direction: 'debit',
                    cents: 1000,
                  },
                  {
                    account: { code: 'revenue_promotions' },
                    direction: 'credit',
                    cents: 1000,
                  },
                ],
              }
            : null,
        ),
    );
    await h.svc.paymentRefunded({} as never, {
      paymentId: 'pay-2',
      refundId: 'r1',
      cents: 500,
      userId: 'u1',
    });
    expect(net(h.posted[0].lines, 'revenue_promotions')).toBe(500);
    expect(net(h.posted[0].lines, 'stripe_platform_balance')).toBe(-500);
  });
});
