import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import {
  LIVE_REFUND_STATUSES,
  RefundsService,
} from '../admin-billing/refunds.service';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { StarsService } from '../stars/stars.service';
import { billingOf, unitField, unspentShare } from './promotions.settings';

const reasonFor = (id: string) => `promotion ${id}: unspent budget`;

/**
 * Owner 2026-10-27: a boost paid per people, taps or real actions that ends
 * before its budget is used (time over, stopped, content gone) gives the
 * unspent share of what was paid back, once. Views boosts are paced to
 * deliver in full and keep the old rule (staff refund by hand).
 *
 * The money goes back through the existing paths: a card payment through
 * RefundsService (same Refund row, Stripe call and ledger booking as a staff
 * refund), stars through the stars balance.
 */
@Injectable()
export class PromotionRefundsService {
  private readonly logger = new Logger(PromotionRefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly refunds?: RefundsService,
    @Optional() private readonly stars?: StarsService,
    // The not yet flushed taps / actions / people count as delivered: the
    // refund must never give back money for results already counted.
    @Optional() private readonly counters?: CounterAggregator,
  ) {}

  /** Best effort: a failure is logged and staff can refund by hand. */
  async refundUnspent(promotionId: string): Promise<number> {
    try {
      return await this.run(promotionId);
    } catch (e) {
      this.logger.warn(
        { promotionId, err: String(e) },
        'promotion unspent refund failed',
      );
      return 0;
    }
  }

  private async run(promotionId: string): Promise<number> {
    const row = await this.prisma.casePromotion.findUnique({
      where: { id: promotionId },
    });
    if (!row || billingOf(row.billing) === 'impressions') return 0;
    const field = unitField(row.billing);
    const pending = this.counters
      ? ((await this.counters.pending('case_promotion', field, [row.id])).get(
          row.id,
        ) ?? 0)
      : 0;
    const p = { ...row, [field]: row[field] + pending };
    if (p.status !== 'finished') return 0;
    if (p.paid_stars > 0) return this.backInStars(p);
    if (!p.payment_id || !this.refunds) return 0;
    const amount = unspentShare(p, p.total_cents, p.refunded_cents);
    if (amount <= 0) return 0;
    const reason = reasonFor(p.id);
    // Once per promotion, however often the end is processed.
    const done = await this.prisma.refund.findFirst({
      where: {
        payment_id: p.payment_id,
        reason,
        status: { in: LIVE_REFUND_STATUSES },
      },
      select: { id: true },
    });
    if (done) return 0;
    const r = await this.refunds.refundBySystem({
      paymentId: p.payment_id,
      amountCents: amount,
      reason,
    });
    if (r.status === 'failed') return 0;
    await this.prisma.casePromotion.update({
      where: { id: p.id },
      data: { refunded_cents: { increment: amount } },
    });
    return amount;
  }

  private async backInStars(p: {
    id: string;
    user_id: string;
    billing: string;
    paid_stars: number;
    refunded_stars: number;
    impressions: number;
    reach: number;
    clicks: number;
    actions: number;
    target_units: number | null;
    target_impressions: number | null;
  }): Promise<number> {
    if (!this.stars) return 0;
    const back = unspentShare(p, p.paid_stars, p.refunded_stars);
    if (back <= 0) return 0;
    const ok = await withTxRetry(this.prisma, async (tx) => {
      const credited = await this.stars!.credit(
        tx,
        p.user_id,
        back,
        'boost_refund',
        `boost_refund:${p.id}`,
        { refId: p.id },
      );
      if (credited) {
        await tx.casePromotion.update({
          where: { id: p.id },
          data: { refunded_stars: { increment: back } },
        });
      }
      return credited;
    });
    return ok ? back : 0;
  }
}
