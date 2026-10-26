import { LedgerService, type LedgerDb } from './ledger.service';
import { platformChargeLines } from './ledger.recipes';
import type { PrismaService } from '../../prisma/prisma.service';

function fakeDb(entryCount: number) {
  const db = {
    ledgerEntry: {
      createMany: jest.fn().mockResolvedValue({ count: entryCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'e1' }),
    },
    ledgerAccount: {
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'a1', code: 'stripe_platform_balance', owner_key: 'platform' },
        { id: 'a2', code: 'revenue_subscriptions', owner_key: 'platform' },
        { id: 'a3', code: 'tax_payable', owner_key: 'platform' },
      ]),
    },
    ledgerLine: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
  };
  return { db, client: db as unknown as LedgerDb };
}

const svc = () => new LedgerService({} as PrismaService);
const input = {
  sourceType: 'payment',
  sourceId: 'p1',
  event: 'paid',
  currency: 'USD',
  description: 'x',
  lines: platformChargeLines({
    grossCents: 1000,
    taxCents: 80,
    target: 'revenue_subscriptions',
  }),
};

describe('LedgerService.post', () => {
  it('writes the entry, accounts and balanced lines', async () => {
    const { db, client } = fakeDb(1);
    const r = await svc().post(client, input);
    expect(r).toEqual({ created: true, entryId: 'e1' });
    expect(db.ledgerEntry.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    const lines = (
      db.ledgerLine.createMany.mock.calls[0][0] as {
        data: { direction: string; amount_cents: number }[];
      }
    ).data;
    const sum = (d: string) =>
      lines
        .filter((l) => l.direction === d)
        .reduce((s, l) => s + l.amount_cents, 0);
    expect(sum('debit')).toBe(1000);
    expect(sum('credit')).toBe(1000);
    // currency is normalised to lower case
    expect(
      (
        db.ledgerEntry.createMany.mock.calls[0][0] as {
          data: { currency: string }[];
        }
      ).data[0].currency,
    ).toBe('usd');
  });

  it('a replay (same source + event) writes nothing', async () => {
    const { db, client } = fakeDb(0);
    const r = await svc().post(client, input);
    expect(r).toEqual({ created: false, entryId: null });
    expect(db.ledgerLine.createMany).not.toHaveBeenCalled();
    expect(db.ledgerAccount.createMany).not.toHaveBeenCalled();
  });

  it('refuses an unbalanced entry before touching the database', async () => {
    const { db, client } = fakeDb(1);
    await expect(
      svc().post(client, {
        ...input,
        lines: [
          {
            account: { code: 'stripe_platform_balance' },
            direction: 'debit',
            cents: 10,
          },
          { account: { code: 'tax_payable' }, direction: 'credit', cents: 9 },
        ],
      }),
    ).rejects.toThrow(/unbalanced/);
    expect(db.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('an empty line list (a free payment) is a no-op, not an error', async () => {
    const { db, client } = fakeDb(1);
    const r = await svc().post(client, { ...input, lines: [] });
    expect(r.created).toBe(false);
    expect(db.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('refuses fractional cents', async () => {
    const { client } = fakeDb(1);
    await expect(
      svc().post(client, {
        ...input,
        lines: [
          {
            account: { code: 'stripe_platform_balance' },
            direction: 'debit',
            cents: 10.5,
          },
          {
            account: { code: 'tax_payable' },
            direction: 'credit',
            cents: 10.5,
          },
        ],
      }),
    ).rejects.toThrow(/integer/);
  });
});
