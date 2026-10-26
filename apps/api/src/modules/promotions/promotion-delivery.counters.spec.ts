import type { CounterAggregator } from '../counters/counter-aggregator.service';
import { PromotionDeliveryService } from './promotion-delivery.service';

/** Owner 2026-10-25 (DB audit finding 8): the hot casePromotion row is no
 * longer UPDATEd per impression / click — the counter aggregator carries
 * the delta, and the budget cap still triggers on DB value + pending. */
function make(opts: { db?: number; pending?: number; target?: number | null }) {
  const bump = jest.fn(() => Promise.resolve());
  const counters = {
    bump,
    pending: jest.fn(() =>
      Promise.resolve(new Map([['p1', opts.pending ?? 0]])),
    ),
  } as unknown as CounterAggregator;
  const prisma = {
    promotionView: {
      findMany: jest.fn(() => Promise.resolve([])),
      create: jest.fn(() => Promise.resolve({})),
      update: jest.fn(),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    promotionDaily: { upsert: jest.fn(() => Promise.resolve({})) },
    casePromotion: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({
          impressions: opts.db ?? 0,
          target_impressions: opts.target ?? null,
          status: 'active',
          user_id: 'owner',
          case_id: null,
          post_id: 'post',
        }),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  };
  const Ctor = PromotionDeliveryService as unknown as new (
    ...a: unknown[]
  ) => PromotionDeliveryService;
  const svc = new Ctor(prisma, undefined, counters);
  return { svc, prisma, bump };
}

describe('PromotionDeliveryService via the counter aggregator', () => {
  it('an impression bumps impressions and reach, not the row', async () => {
    const { svc, prisma, bump } = make({});
    await svc.record('viewer', ['p1']);
    expect(bump).toHaveBeenCalledWith('case_promotion', 'p1', 'impressions', 1);
    expect(bump).toHaveBeenCalledWith('case_promotion', 'p1', 'reach', 1);
    expect(prisma.casePromotion.update).not.toHaveBeenCalled();
    expect(prisma.casePromotion.updateMany).not.toHaveBeenCalled();
  });

  it('finishes the promotion when DB + pending reaches the target', async () => {
    const { svc, prisma } = make({ db: 8, pending: 2, target: 10 });
    await svc.record('viewer', ['p1']);
    expect(prisma.casePromotion.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'active' },
      data: { status: 'finished', cancel_reason: 'budget_spent' },
    });
  });

  it('does not finish below the target', async () => {
    const { svc, prisma } = make({ db: 8, pending: 1, target: 10 });
    await svc.record('viewer', ['p1']);
    expect(prisma.casePromotion.updateMany).not.toHaveBeenCalled();
  });

  it('a first click bumps clicks once, not the row', async () => {
    const { svc, prisma, bump } = make({});
    expect(await svc.click('viewer', 'p1')).toBe(true);
    expect(bump).toHaveBeenCalledWith('case_promotion', 'p1', 'clicks', 1);
    expect(prisma.casePromotion.update).not.toHaveBeenCalled();
  });
});
