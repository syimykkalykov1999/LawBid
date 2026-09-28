import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BidsService } from '../../modules/bids/bids.service';
import type { SubscriptionAccessService } from '../../modules/subscriptions/subscription-access.service';
import {
  BID_SUBSCRIPTION_LAPSE_BATCH,
  BidSubscriptionLapseJob,
} from './bid-subscription-lapse.job';

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

describe('BidSubscriptionLapseJob (docs/04 §2, stage 4.4 safety net)', () => {
  it('withdraws only attorneys who are no longer isActive(), paginating past a full batch', () => {
    return runScenario();
  });

  async function runScenario() {
    // Exactly BID_SUBSCRIPTION_LAPSE_BATCH + 1 attorneys with an active
    // bid, so groupBy must be called twice (cursor pagination) — 'a-000'
    // is active (skipped), all others are lapsed.
    const total = BID_SUBSCRIPTION_LAPSE_BATCH + 1;
    const ids = Array.from(
      { length: total },
      (_, i) => `a-${String(i).padStart(4, '0')}`,
    );
    const groupBy = jest.fn(
      (args: { where: { attorney_id?: { gt: string } }; take: number }) => {
        const after = args.where.attorney_id?.gt;
        const start = after ? ids.indexOf(after) + 1 : 0;
        return Promise.resolve(
          ids.slice(start, start + args.take).map((attorney_id) => ({
            attorney_id,
          })),
        );
      },
    );
    const prisma = { bid: { groupBy } } as unknown as PrismaService;
    const isActive = jest.fn((id: string) => Promise.resolve(id === ids[0]));
    const subscriptions = { isActive } as unknown as SubscriptionAccessService;
    const withdrawActiveBidsForAttorney = jest.fn(() => Promise.resolve(2));
    const bids = { withdrawActiveBidsForAttorney } as unknown as BidsService;

    const job = new BidSubscriptionLapseJob(
      prisma,
      subscriptions,
      bids,
      logger,
    );
    const result = await job.run();

    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(result.attorneysChecked).toBe(total);
    // Every attorney but ids[0] is lapsed.
    expect(withdrawActiveBidsForAttorney).toHaveBeenCalledTimes(total - 1);
    expect(withdrawActiveBidsForAttorney).not.toHaveBeenCalledWith(ids[0]);
    expect(result.bidsWithdrawn).toBe((total - 1) * 2);
  }
});
