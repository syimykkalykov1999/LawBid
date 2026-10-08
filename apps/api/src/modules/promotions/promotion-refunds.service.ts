import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import {
  assertRefundAllowed,
  LIVE_REFUND_STATUSES,
} from '../admin-billing/refunds.service';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import { refreshProvider } from '../billing/dynamic-payment.provider';
import type { PaymentProvider } from '../billing/payment-provider';
import { NotificationsService } from '../notifications/notifications.service';
import { billingOf, unspentCents } from './promotions.settings';

/** Refunds made by the system, not by a staff member. */
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

const reasonFor = (id: string) => `promotion ${id}: unspent budget`;

/**
 * Owner 2026-10-07: a boost paid per people, taps or actions that ends
 * (time over, stopped, content gone) before its budget is used gives the
 * unspent share of the paid amount back to the card, once. Impressions
 * boosts are paced to deliver in full and keep the old rule.
 */
@Injectable()
export class PromotionRefundsService {
  private readonly logger = new Logger(PromotionRefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    @Optional() private readonly notifications?: NotificationsService,
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
    const p = await this.prisma.casePromotion.findUnique({
      where: { id: promotionId },
    });
    if (!p || !p.payment_id || billingOf(p.billing) === 'impressions') {
      return 0;
    }
    if (p.status !== 'finished') return 0;
    const amount = unspentCents(p);
    if (amount <= 0 || !this.provider) return 0;
    const payment = await this.prisma.payment.findUnique({
      where: { id: p.payment_id },
    });
    if (!payment) return 0;
    await refreshProvider(this.provider);
    const intentId =
      payment.stripe_payment_intent_id ??
      (this.provider.name === 'fake' ? `pi_fake_${payment.id}` : null);
    if (!intentId || typeof this.provider.refund !== 'function') return 0;

    const reason = reasonFor(p.id);
    const reserved = await withTxRetry(this.prisma, async (tx) => {
      // Once per promotion.
      const done = await tx.refund.findFirst({
        where: {
          payment_id: payment.id,
          reason,
          status: { in: LIVE_REFUND_STATUSES },
        },
        select: { id: true },
      });
      if (done) return null;
      const sum = await tx.refund.aggregate({
        where: {
          payment_id: payment.id,
          status: { in: LIVE_REFUND_STATUSES },
        },
        _sum: { amount_cents: true },
      });
      const left = assertRefundAllowed(
        payment,
        sum._sum.amount_cents ?? 0,
        amount,
      );
      const row = await tx.refund.create({
        data: {
          payment_id: payment.id,
          user_id: payment.user_id,
          amount_cents: amount,
          reason,
          status: 'pending',
          admin_id: SYSTEM_ACTOR,
        },
      });
      return { row, left };
    });
    if (!reserved) return 0;

    let status: string;
    try {
      const r = await this.provider.refund({
        paymentIntentId: intentId,
        amountCents: amount,
        idempotencyKey: `refund:${reserved.row.id}`,
        metadata: { refundId: reserved.row.id, paymentId: payment.id },
      });
      status = r.status;
      await withTxRetry(this.prisma, async (tx) => {
        await tx.refund.update({
          where: { id: reserved.row.id },
          data: {
            status: r.status,
            stripe_refund_id: r.id,
            failure_reason: r.failureReason,
          },
        });
        if (r.status === 'succeeded' && reserved.left === 0) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'refunded' },
          });
        }
        if (r.status !== 'failed') {
          await tx.casePromotion.update({
            where: { id: p.id },
            data: { refunded_cents: { increment: amount } },
          });
        }
      });
    } catch (e) {
      await this.prisma.refund.update({
        where: { id: reserved.row.id },
        data: {
          status: 'failed',
          failure_reason: String(e).slice(0, 500),
        },
      });
      throw e;
    }
    if (status === 'failed') return 0;
    await this.notifications
      ?.emit({
        type: 'promotion_refunded',
        recipientId: p.user_id,
        payload: {
          promotionId: p.id,
          amount: `$${(amount / 100).toFixed(2)}`,
          ...(p.case_id ? { caseId: p.case_id } : {}),
          ...(p.post_id ? { postId: p.post_id } : {}),
        },
      })
      .catch(() => undefined);
    return amount;
  }
}
