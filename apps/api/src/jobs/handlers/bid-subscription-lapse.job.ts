import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { forEachDatabase } from '../../sharding/for-each-database';
import { PrismaService } from '../../prisma/prisma.service';
import { BidsService } from '../../modules/bids/bids.service';
import { SubscriptionAccessService } from '../../modules/subscriptions/subscription-access.service';

/** Attorneys per sweep (docs/02 §1.1: short statements, batched). */
export const BID_SUBSCRIPTION_LAPSE_BATCH = 500;

export interface BidSubscriptionLapseResult {
  attorneysChecked: number;
  bidsWithdrawn: number;
}

/**
 * docs/04_CASES_BIDS.md §2 (stage 4.4): "Если подписка адвоката перестала
 * быть активной ..., сервис подписок (файл 6) вызывает
 * BidsService.withdrawActiveBidsForAttorney(attorneyId)." That direct call
 * is the eventual path once file 06 ships real Stripe subscriptions and
 * fires this on its cancel/expiry webhook.
 *
 * Since docs/06 stage 6.7 SubscriptionAccessService reads the real
 * `subscriptions` row (webhooks withdraw bids on the transition); this job
 * is the safety net for a missed webhook or an expired grace period, and a
 * lapse can happen with no webhook to call this at all — e.g. the nightly
 * license-expiry job (docs/03 §2.6) downgrading a profile to
 * `unverified`, or a verifier suspending an attorney. This hourly sweep is
 * the safety net for exactly that gap: it finds attorneys who still hold
 * `active` bids but are no longer `isActive()`, and withdraws them. Once
 * file 06 wires the real event, this job becomes a pure backstop (0 rows
 * on every normal run) rather than the primary trigger.
 *
 * Idempotent: withdrawActiveBidsForAttorney only touches bids still
 * `status = active`, so re-running (a retried job, or this sweep finding
 * the same attorney twice) does nothing on the second pass. Not gated by
 * an extra Redis lock: the job runs on the `cron-heavy` lane at
 * concurrency 1, so two sweeps never run at once.
 *
 * 13.11 (owner list row 76, 1B load test): ~900 000 attorneys with active
 * bids on the 10M stand; one isActive() per attorney took ~21 minutes and
 * held the one-at-a-time `cron` lane (partition.tick and 64 other jobs
 * waited). Now each batch of [BID_SUBSCRIPTION_LAPSE_BATCH] is checked by
 * SubscriptionAccessService.activeAmong (same rule, two reads), and the
 * job sits on the heavy lane with the other long sweeps.
 */
@Injectable()
export class BidSubscriptionLapseJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionAccessService,
    private readonly bids: BidsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BidSubscriptionLapseJob.name);
  }

  async run(): Promise<BidSubscriptionLapseResult> {
    const result: BidSubscriptionLapseResult = {
      attorneysChecked: 0,
      bidsWithdrawn: 0,
    };
    // Shard-ready step 8: attorneys with active bids are found database by
    // database (the sweep names no case); the withdraw itself covers all.
    await forEachDatabase(this.prisma, async () => {
      let cursor: string | undefined;
      for (;;) {
        const rows = await this.prisma.bid.groupBy({
          by: ['attorney_id'],
          where: {
            status: 'active',
            ...(cursor ? { attorney_id: { gt: cursor } } : {}),
          },
          orderBy: { attorney_id: 'asc' },
          take: BID_SUBSCRIPTION_LAPSE_BATCH,
        });
        // 13.11 (owner list row 76): the whole batch is checked in two
        // set-based reads instead of one isActive() per attorney.
        const ids = rows.map((r) => r.attorney_id);
        const active = await this.subscriptions.activeAmong(ids);
        for (const attorneyId of ids) {
          result.attorneysChecked += 1;
          if (active.has(attorneyId)) continue;
          const withdrawn =
            await this.bids.withdrawActiveBidsForAttorney(attorneyId);
          result.bidsWithdrawn += withdrawn;
        }
        if (rows.length < BID_SUBSCRIPTION_LAPSE_BATCH) break;
        cursor = rows[rows.length - 1].attorney_id;
      }
    });
    this.logger.info({ ...result }, 'bid subscription lapse sweep finished');
    return result;
  }
}
