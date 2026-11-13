import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BidsService } from '../../modules/bids/bids.service';
import type { SubscriptionAccessService } from '../../modules/subscriptions/subscription-access.service';
import {
  BID_SUBSCRIPTION_LAPSE_BATCH,
  BidSubscriptionLapseJob,
} from './bid-subscription-lapse.job';
import { CRON_HEAVY_QUEUE, CRON_JOBS, cronLaneOf } from '../jobs.constants';

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

describe('BidSubscriptionLapseJob (docs/04 §2, stage 4.4 safety net)', () => {
  it('runs on the heavy lane, not the one-at-a-time default lane (row 76)', () => {
    expect(cronLaneOf(CRON_JOBS.bidSubscriptionLapse)).toBe(CRON_HEAVY_QUEUE);
  });

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
    // Row 76: one set-based check per batch, never isActive() per attorney.
    const activeAmong = jest.fn((batch: string[]) =>
      Promise.resolve(new Set(batch.filter((id) => id === ids[0]))),
    );
    const isActive = jest.fn();
    const subscriptions = {
      activeAmong,
      isActive,
    } as unknown as SubscriptionAccessService;
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
    expect(activeAmong).toHaveBeenCalledTimes(2);
    expect(activeAmong.mock.calls[0][0]).toHaveLength(
      BID_SUBSCRIPTION_LAPSE_BATCH,
    );
    expect(activeAmong.mock.calls[1][0]).toEqual([ids[total - 1]]);
    expect(isActive).not.toHaveBeenCalled();
    expect(result.attorneysChecked).toBe(total);
    // Every attorney but ids[0] is lapsed.
    expect(withdrawActiveBidsForAttorney).toHaveBeenCalledTimes(total - 1);
    expect(withdrawActiveBidsForAttorney).not.toHaveBeenCalledWith(ids[0]);
    expect(result.bidsWithdrawn).toBe((total - 1) * 2);
  }
});
