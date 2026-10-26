import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER } from '../../modules/billing/billing.constants';
import { refreshProvider } from '../../modules/billing/dynamic-payment.provider';
import type { PaymentProvider } from '../../modules/billing/payment-provider';
import { SubscriptionSyncService } from '../../modules/billing/subscription-sync.service';

export interface VerificationLossResult {
  attorneys: number;
  subscriptionsCanceled: number;
  refundedCents: number;
  promotionsCanceled: number;
}

/** The unused share of a paid amount: `cents * left / total`, never above
 * the amount and never negative. */
export function unusedShare(
  cents: number,
  left: number,
  total: number,
): number {
  if (total <= 0 || left <= 0 || cents <= 0) return 0;
  return Math.min(cents, Math.floor((cents * Math.min(left, total)) / total));
}

/**
 * Owner 2026-10-16: an attorney who is no longer verified (rejected,
 * suspended) must not keep paying for what only a verified attorney may
 * use. Every few minutes: the subscription ends now and the unused part of
 * the period is refunded; unused offer-pack credits are refunded; running
 * boosts stop and their unused days are refunded. Everything is idempotent
 * (a canceled subscription / promotion is not handled twice, a refund is
 * keyed) and can be switched off with `billing.cancel_on_verification_loss`.
 */
@Injectable()
export class VerificationLossBillingJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly sync: SubscriptionSyncService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(VerificationLossBillingJob.name);
  }

  async run(): Promise<VerificationLossResult> {
    const out: VerificationLossResult = {
      attorneys: 0,
      subscriptionsCanceled: 0,
      refundedCents: 0,
      promotionsCanceled: 0,
    };
    if (!(await this.settings.boolean('billing.cancel_on_verification_loss'))) {
      return out;
    }
    const lost = await this.prisma.attorneyProfile.findMany({
      where: { verification_status: { in: ['rejected', 'suspended'] } },
      select: { user_id: true },
    });
    for (const { user_id: userId } of lost) {
      try {
        const did = await this.handle(userId, out);
        if (did) out.attorneys += 1;
      } catch (err) {
        this.logger.error({ err, userId }, 'verification-loss billing failed');
      }
    }
    if (out.attorneys > 0) {
      this.logger.info({ ...out }, 'verification-loss billing finished');
    }
    return out;
  }

  private async handle(
    userId: string,
    out: VerificationLossResult,
  ): Promise<boolean> {
    let did = false;
    await refreshProvider(this.provider);
    const sub = await this.prisma.subscription.findUnique({
      where: { user_id: userId },
    });
    if (
      sub?.stripe_subscription_id &&
      ['active', 'trialing', 'past_due'].includes(sub.status)
    ) {
      const now = Date.now();
      const start = sub.current_period_start?.getTime() ?? null;
      const end = sub.current_period_end?.getTime() ?? null;
      const remote = await this.provider.cancelNow(sub.stripe_subscription_id);
      await this.sync.apply(remote, {}, { notify: false });
      out.subscriptionsCanceled += 1;
      did = true;
      // A trial paid nothing; a paid period returns its unused share.
      if (sub.status === 'active' && start !== null && end !== null) {
        const payment = await this.prisma.payment.findFirst({
          where: {
            user_id: userId,
            status: 'succeeded',
            stripe_invoice_id: { not: null },
          },
          orderBy: { paid_at: 'desc' },
        });
        if (payment) {
          const cents = unusedShare(
            payment.amount_cents,
            end - now,
            end - start,
          );
          out.refundedCents += await this.refund(
            payment.id,
            cents,
            'Verification lost: the unused part of the period',
          );
        }
      }
    }

    // Running boosts stop; the days not delivered go back.
    const promos = await this.prisma.casePromotion.findMany({
      where: {
        user_id: userId,
        status: { in: ['active', 'paused', 'pending_review'] },
      },
    });
    for (const p of promos) {
      let cents = p.total_cents - p.refunded_cents;
      if (p.starts_at && p.ends_at && p.status !== 'pending_review') {
        cents = unusedShare(
          p.total_cents,
          p.ends_at.getTime() - Date.now(),
          p.ends_at.getTime() - p.starts_at.getTime(),
        );
        cents = Math.max(0, Math.min(cents, p.total_cents - p.refunded_cents));
      }
      await this.prisma.casePromotion.update({
        where: { id: p.id },
        data: { status: 'canceled', cancel_reason: 'verification_lost' },
      });
      out.promotionsCanceled += 1;
      did = true;
      if (p.payment_id && cents > 0) {
        const got = await this.refund(
          p.payment_id,
          cents,
          'Verification lost: the unused part of a boost',
        );
        out.refundedCents += got;
        if (got > 0) {
          await this.prisma.casePromotion.update({
            where: { id: p.id },
            data: { refunded_cents: { increment: got } },
          });
        }
      }
    }

    // Offer packs: credits not spent go back, newest purchase first.
    const credit = await this.prisma.bidCredit.findUnique({
      where: { user_id: userId },
    });
    if (credit && credit.balance > 0) {
      let left = credit.balance;
      const purchases = await this.prisma.bidPackPurchase.findMany({
        where: { user_id: userId, status: 'paid', payment_id: { not: null } },
        orderBy: { paid_at: 'desc' },
        take: 20,
      });
      for (const pur of purchases) {
        if (left <= 0) break;
        const take = Math.min(left, pur.bids);
        const cents = unusedShare(pur.price_cents, take, pur.bids);
        const got = await this.refund(
          pur.payment_id!,
          cents,
          'Verification lost: unused offer credits',
        );
        if (got > 0) {
          out.refundedCents += got;
          left -= take;
          await this.prisma.bidCredit.update({
            where: { user_id: userId },
            data: { balance: { decrement: take } },
          });
          did = true;
        }
      }
    }
    return did;
  }

  /** Refunds [cents] of a payment (system actor); returns what went back. */
  private async refund(
    paymentId: string,
    cents: number,
    reason: string,
  ): Promise<number> {
    if (cents <= 0 || typeof this.provider.refund !== 'function') return 0;
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    const intent =
      payment?.stripe_payment_intent_id ??
      (payment && this.provider.name === 'fake'
        ? `pi_fake_${payment.id}`
        : null);
    if (!payment || !intent) return 0;
    const done = await this.prisma.refund.aggregate({
      where: {
        payment_id: payment.id,
        status: { in: ['pending', 'succeeded'] },
      },
      _sum: { amount_cents: true },
    });
    const room = payment.amount_cents - (done._sum.amount_cents ?? 0);
    const amount = Math.min(cents, room);
    if (amount <= 0) return 0;
    const row = await this.prisma.refund.create({
      data: {
        payment_id: payment.id,
        user_id: payment.user_id,
        amount_cents: amount,
        reason,
        status: 'pending',
        admin_id: null,
      },
    });
    try {
      const r = await this.provider.refund({
        paymentIntentId: intent,
        amountCents: amount,
        idempotencyKey: `refund:${row.id}`,
        metadata: { refundId: row.id, paymentId: payment.id, system: 'loss' },
      });
      await this.prisma.refund.update({
        where: { id: row.id },
        data: {
          status: r.status,
          stripe_refund_id: r.id,
          failure_reason: r.failureReason,
        },
      });
      return r.status === 'failed' ? 0 : amount;
    } catch (e) {
      await this.prisma.refund.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          failure_reason: (e instanceof Error ? e.message : String(e)).slice(
            0,
            500,
          ),
        },
      });
      return 0;
    }
  }
}
