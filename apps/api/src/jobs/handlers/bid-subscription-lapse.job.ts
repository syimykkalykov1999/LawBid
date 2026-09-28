import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
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
 * Until then SubscriptionAccessService is a stub keyed only off
 * `attorney_profiles.verification_status` (TODO docs/06 stage 6.7), and a
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
 * an extra Redis lock: JobsRunner runs the `cron` queue with a single
 * worker at concurrency 1, so two sweeps never run at once.
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
      for (const row of rows) {
        result.attorneysChecked += 1;
        if (await this.subscriptions.isActive(row.attorney_id)) continue;
        const withdrawn = await this.bids.withdrawActiveBidsForAttorney(
          row.attorney_id,
        );
        result.bidsWithdrawn += withdrawn;
      }
      if (rows.length < BID_SUBSCRIPTION_LAPSE_BATCH) break;
      cursor = rows[rows.length - 1].attorney_id;
    }
    this.logger.info({ ...result }, 'bid subscription lapse sweep finished');
    return result;
  }
}
