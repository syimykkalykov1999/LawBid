import type { ConfigService } from '@nestjs/config';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { BidPacksService } from './bid-packs.service';

/**
 * Algo audit 2026-10-27 (MONEY H-5): a refund or charge-back of an offer
 * pack takes the unused offers back — before, the money went back and the
 * offers stayed. Never below zero (spent offers are not clawed back) and
 * idempotent (a pack is revoked once).
 */
describe('BidPacksService.refundPayments', () => {
  function make(opts: { enabled?: boolean; balance?: number } = {}) {
    const purchases = [
      {
        id: 'bp-1',
        user_id: 'u1',
        bids: 10,
        status: 'paid',
        payment_id: 'pay-1',
      },
      {
        id: 'bp-2',
        user_id: 'u1',
        bids: 5,
        status: 'paid',
        payment_id: 'pay-2',
      },
    ];
    const sql: string[] = [];
    const values: unknown[][] = [];
    const tx = {
      bidPackPurchase: {
        updateMany: jest.fn(
          ({ where }: { where: { id: string; status: string } }) => {
            const p = purchases.find(
              (x) => x.id === where.id && x.status === where.status,
            );
            if (!p) return Promise.resolve({ count: 0 });
            p.status = 'refunded';
            return Promise.resolve({ count: 1 });
          },
        ),
      },
      $executeRaw: jest.fn((strings: TemplateStringsArray, ...v: unknown[]) => {
        sql.push(strings.join('?'));
        values.push(v);
        return Promise.resolve(1);
      }),
    };
    const prisma = {
      bidPackPurchase: {
        findMany: jest.fn(
          ({
            where,
          }: {
            where: { payment_id: { in: string[] }; status: string };
          }) =>
            Promise.resolve(
              purchases.filter(
                (p) =>
                  where.payment_id.in.includes(p.payment_id) &&
                  p.status === where.status,
              ),
            ),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const settings = {
      boolean: jest.fn(() => Promise.resolve(opts.enabled ?? true)),
    } as unknown as AppSettingsService;
    const svc = new BidPacksService(
      prisma as unknown as PrismaService,
      { get: () => undefined } as unknown as ConfigService,
      undefined,
      settings,
    );
    return { svc, purchases, sql, values, tx };
  }

  it('marks the pack refunded and takes its offers off the balance, not below zero', async () => {
    const h = make();
    expect(await h.svc.refundPayments(['pay-1'])).toBe(1);
    expect(h.purchases[0].status).toBe('refunded');
    expect(h.purchases[1].status).toBe('paid');
    expect(h.sql[0]).toContain('GREATEST(balance - ');
    expect(h.values[0]).toEqual([10, 'u1']);
  });

  it('is idempotent: the same payment refunded twice revokes once', async () => {
    const h = make();
    await h.svc.refundPayments(['pay-1', 'pay-2']);
    expect(await h.svc.refundPayments(['pay-1', 'pay-2'])).toBe(0);
    expect(h.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('does nothing with the switch off or no payments', async () => {
    expect(await make({ enabled: false }).svc.refundPayments(['pay-1'])).toBe(
      0,
    );
    expect(await make().svc.refundPayments([])).toBe(0);
  });
});
