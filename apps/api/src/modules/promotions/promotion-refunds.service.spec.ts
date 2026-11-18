import { PromotionRefundsService } from './promotion-refunds.service';

/** Owner 2026-10-27: the unspent part of a per-result boost goes back. */
function make(row: Record<string, unknown> | null, existingRefund = false) {
  const prisma = {
    casePromotion: {
      findUnique: jest.fn(() => Promise.resolve(row)),
      update: jest.fn(() => Promise.resolve({})),
    },
    refund: {
      findFirst: jest.fn(() =>
        Promise.resolve(existingRefund ? { id: 'r0' } : null),
      ),
    },
    $transaction: jest.fn(),
  };
  const refunds = {
    refundBySystem: jest.fn(() => Promise.resolve({ status: 'succeeded' })),
  };
  const svc = new PromotionRefundsService(
    prisma as never,
    refunds as never,
    undefined,
  );
  return { svc, prisma, refunds };
}

const row = (o: Record<string, unknown> = {}) => ({
  id: 'p1',
  user_id: 'u1',
  status: 'finished',
  billing: 'clicks',
  payment_id: 'pay1',
  total_cents: 1000,
  refunded_cents: 0,
  paid_stars: 0,
  refunded_stars: 0,
  impressions: 500,
  reach: 100,
  clicks: 25,
  actions: 0,
  target_units: 100,
  target_impressions: null,
  ...o,
});

describe('PromotionRefundsService', () => {
  it('refunds the undelivered share through the staff refund path', async () => {
    const { svc, refunds, prisma } = make(row());
    expect(await svc.refundUnspent('p1')).toBe(750);
    expect(refunds.refundBySystem).toHaveBeenCalledWith({
      paymentId: 'pay1',
      amountCents: 750,
      reason: 'promotion p1: unspent budget',
    });
    expect(prisma.casePromotion.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { refunded_cents: { increment: 750 } },
    });
  });

  it('leaves a views boost alone (old rule)', async () => {
    const { svc, refunds } = make(row({ billing: 'impressions' }));
    expect(await svc.refundUnspent('p1')).toBe(0);
    expect(refunds.refundBySystem).not.toHaveBeenCalled();
  });

  it('refunds nothing when the budget was used or the boost is not finished', async () => {
    const used = make(row({ clicks: 100 }));
    expect(await used.svc.refundUnspent('p1')).toBe(0);
    const running = make(row({ status: 'active' }));
    expect(await running.svc.refundUnspent('p1')).toBe(0);
    expect(used.refunds.refundBySystem).not.toHaveBeenCalled();
    expect(running.refunds.refundBySystem).not.toHaveBeenCalled();
  });

  it('refunds once, however often the end is processed', async () => {
    const { svc, refunds } = make(row(), true);
    expect(await svc.refundUnspent('p1')).toBe(0);
    expect(refunds.refundBySystem).not.toHaveBeenCalled();
  });

  it('never refunds more than what is left of the payment', async () => {
    const { svc, refunds } = make(row({ refunded_cents: 900 }));
    expect(await svc.refundUnspent('p1')).toBe(100);
    expect(refunds.refundBySystem).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 100 }),
    );
  });

  it('a failed provider refund returns 0 and does not mark money back', async () => {
    const { svc, refunds, prisma } = make(row());
    refunds.refundBySystem.mockResolvedValueOnce({ status: 'failed' });
    expect(await svc.refundUnspent('p1')).toBe(0);
    expect(prisma.casePromotion.update).not.toHaveBeenCalled();
  });

  it('a thrown error is swallowed (staff can refund by hand)', async () => {
    const { svc, refunds } = make(row());
    refunds.refundBySystem.mockRejectedValueOnce(new Error('stripe down'));
    await expect(svc.refundUnspent('p1')).resolves.toBe(0);
  });
});

/** Batch 8 PM1/PM2 (audit 2026-11-17): money that reached a promotion which
 * could no longer start goes back in full, once. */
describe('PromotionRefundsService.refundUnapplied', () => {
  it('refunds the whole payment through the staff refund path, once', async () => {
    const { svc, refunds, prisma } = make(row({ status: 'canceled' }));
    expect(await svc.refundUnapplied('p1', 'pay1', 1000)).toBe(1000);
    expect(refunds.refundBySystem).toHaveBeenCalledWith(
      {
        paymentId: 'pay1',
        amountCents: 1000,
        reason: 'promotion p1: paid after it was closed',
      },
      { idempotencyKey: 'promotion-unapplied:pay1' },
    );
    expect(prisma.casePromotion.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { refunded_cents: { increment: 1000 } },
    });
    const again = make(row({ status: 'canceled' }), true);
    expect(await again.svc.refundUnapplied('p1', 'pay1', 1000)).toBe(0);
    expect(again.refunds.refundBySystem).not.toHaveBeenCalled();
  });

  it('never throws (staff see the failed refund row)', async () => {
    const { svc, refunds } = make(row({ status: 'canceled' }));
    refunds.refundBySystem.mockRejectedValueOnce(new Error('stripe down'));
    expect(await svc.refundUnapplied('p1', 'pay1', 1000)).toBe(0);
  });
});
