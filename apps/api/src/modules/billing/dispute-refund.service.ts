import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, type BillingDisputeRefund } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  LIVE_REFUND_STATUSES,
  RefundsService,
} from '../admin-billing/refunds.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.public';
import { NotificationsService } from '../notifications/notifications.service';
import { StripeReviewService } from '../stripe-ops/stripe-review.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER } from './billing.constants';
import {
  disputeRefundGuard,
  disputeRefundKey,
  disputeRefundReason,
  firstChargeCancelRef,
  firstChargeRefundable,
  inquiryRefundable,
  isFirstChargeCancelRef,
} from './dispute-refund.logic';
import { refreshProvider } from './dynamic-payment.provider';
import type { PaymentProvider } from './payment-provider';
import { SubscriptionSyncService } from './subscription-sync.service';

/** Subscription states in which nothing is left to cancel. */
const ENDED = new Set(['canceled', 'incomplete_expired']);
/** The same list as the duplicate-subscription fix. */
const FRAUD_HOLD_STATUSES = ['review', 'restricted', 'banned'];

export interface InquiryInput {
  disputeId: string;
  status: string;
  chargeRefundable: boolean;
  /** Stripe's deadline to answer, unix seconds. */
  dueBy: number | null;
  paymentId: string;
}

/**
 * R-237 (owner 2026-11-05): the automatic refund on a dispute about a
 * subscription charge. Behind the `dispute_auto_refund` flag (off).
 *
 * What may be refunded is set by Stripe (docs.stripe.com/disputes/how-disputes-work):
 *  - a chargeback: the bank already took the money and a refund is refused, so
 *    never (SubscriptionDisputeService cancels the subscription as before);
 *  - an inquiry: no money has moved and "issuing a full refund" resolves it
 *    with no dispute fee; a partial one can still escalate, so always all that
 *    is left of the payment.
 *
 * Order as in the duplicate-subscription fix: the subscription is cancelled,
 * then the money goes. One `billing_dispute_refunds` row per dispute and the
 * Stripe key `dispute:<id>:refund` make a repeated webhook unable to pay twice.
 * Above the limits (billing.dispute_refund_*), for an account under review or
 * with another dispute, the row waits in «Платежи → Возвраты по спорам».
 */
@Injectable()
export class DisputeRefundService {
  private readonly logger = new Logger(DisputeRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly settings: AppSettingsService,
    private readonly sync: SubscriptionSyncService,
    private readonly access: SubscriptionAccessService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly refunds?: RefundsService,
    @Optional() private readonly review?: StripeReviewService,
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  /** No flag service = off: real money never moves by accident. */
  async enabled(): Promise<boolean> {
    return (await this.flags?.isEnabled('dispute_auto_refund', false)) ?? false;
  }

  /** Answers true when the inquiry is now handled here (refunded or waiting
   * for a person), so the caller does not raise its own alert as well. */
  async onInquiry(input: InquiryInput): Promise<boolean> {
    const existing = await this.prisma.billingDisputeRefund.findUnique({
      where: { dispute_id: input.disputeId },
    });
    if (existing) {
      // A repeat, or a crash between the reservation and the money.
      if (existing.status === 'refunding') await this.settle(existing, true);
      return true;
    }
    if (!(await this.enabled()) || !inquiryRefundable(input)) return false;
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      select: {
        id: true,
        user_id: true,
        status: true,
        amount_cents: true,
        currency: true,
      },
    });
    if (!payment || payment.status !== 'succeeded') return false;
    const taken = await this.prisma.refund.aggregate({
      where: { payment_id: payment.id, status: { in: LIVE_REFUND_STATUSES } },
      _sum: { amount_cents: true },
    });
    const cents = payment.amount_cents - (taken._sum.amount_cents ?? 0);
    if (cents <= 0) return false;
    const row = await this.reserve(input.disputeId, payment, cents);
    if (!row) return true;
    if (row.status === 'review') {
      await this.hold(row, input.dueBy);
      return true;
    }
    await this.settle(row, true);
    return true;
  }

  /**
   * Sweep B-c3 (2026-11-09): a «disputed» subscription without a bank — the
   * attorney cancelled right after the first charge. Called after a cancel;
   * answers true when the first charge is refunded (access ends now) or
   * waits for a person. Same switch, same limits, same table and journal
   * as the bank inquiry; one row per payment (`cancel:<payment>`), so a
   * repeated cancel / resume / cancel never pays twice.
   */
  async onFirstChargeCancel(userId: string, now = new Date()): Promise<boolean> {
    if (!(await this.enabled())) return false;
    const windowDays = await this.settings.number(
      'billing.first_charge_refund_days',
    );
    if (!(windowDays > 0)) return false;
    const [succeededPayments, first] = await Promise.all([
      this.prisma.payment.count({
        where: {
          user_id: userId,
          status: 'succeeded',
          stripe_invoice_id: { not: null },
        },
      }),
      this.prisma.payment.findFirst({
        where: {
          user_id: userId,
          status: 'succeeded',
          stripe_invoice_id: { not: null },
        },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          user_id: true,
          amount_cents: true,
          currency: true,
          created_at: true,
        },
      }),
    ]);
    if (
      !first ||
      !firstChargeRefundable({
        now,
        windowDays,
        succeededPayments,
        firstChargeAt: first.created_at,
      })
    ) {
      return false;
    }
    const existing = await this.prisma.billingDisputeRefund.findUnique({
      where: { dispute_id: firstChargeCancelRef(first.id) },
    });
    if (existing) {
      if (existing.status === 'refunding') await this.settle(existing, true);
      return existing.status !== 'rejected' && existing.status !== 'no_refund';
    }
    const taken = await this.prisma.refund.aggregate({
      where: { payment_id: first.id, status: { in: LIVE_REFUND_STATUSES } },
      _sum: { amount_cents: true },
    });
    const cents = first.amount_cents - (taken._sum.amount_cents ?? 0);
    if (cents <= 0) return false;
    const row = await this.reserve(firstChargeCancelRef(first.id), first, cents);
    if (!row) return true;
    if (row.status === 'review') {
      await this.hold(row, null);
      return true;
    }
    await this.settle(row, true);
    return true;
  }

  /**
   * One `billing_dispute_refunds` row per reference, decided by the
   * anti-abuse guard inside one transaction (`refunding` or `review`).
   * null = another delivery holds the row already.
   */
  private async reserve(
    ref: string,
    payment: {
      id: string;
      user_id: string;
      currency: string;
    },
    cents: number,
  ): Promise<BillingDisputeRefund | null> {
    const [fraudReview, priorDisputes, maxCents, userLimit, days, dailyCap] =
      await Promise.all([
        this.underReview(payment.user_id),
        this.prisma.stripeReviewItem.count({
          where: {
            user_id: payment.user_id,
            kind: { in: ['dispute', 'early_fraud_warning'] },
            NOT: { stripe_ref: ref },
          },
        }),
        this.settings.number('billing.dispute_refund_max_cents'),
        this.settings.number('billing.dispute_refund_user_limit'),
        this.settings.number('billing.dispute_refund_window_days'),
        this.settings.number('billing.dispute_refund_daily_cap_cents'),
      ]);

    try {
      return await withTxRetry(
        this.prisma,
        async (tx) => {
          const dayStart = new Date(new Date().toISOString().slice(0, 10));
          const since = new Date(Date.now() - Math.max(0, days) * 86_400_000);
          const [userRefunds, today] = await Promise.all([
            tx.billingDisputeRefund.count({
              where: {
                user_id: payment.user_id,
                status: { in: ['refunding', 'refunded'] },
                created_at: { gte: since },
              },
            }),
            tx.billingDisputeRefund.aggregate({
              where: {
                status: { in: ['refunding', 'refunded'] },
                created_at: { gte: dayStart },
              },
              _sum: { amount_cents: true },
            }),
          ]);
          const hold = disputeRefundGuard({
            fraudReview,
            priorDisputes,
            refundCents: cents,
            maxCents,
            userRefunds,
            userLimit,
            refundedTodayCents: today._sum.amount_cents ?? 0,
            dailyCapCents: dailyCap,
          });
          return tx.billingDisputeRefund.create({
            data: {
              dispute_id: ref,
              user_id: payment.user_id,
              payment_id: payment.id,
              status: hold ? 'review' : 'refunding',
              reason: hold,
              amount_cents: cents,
              currency: payment.currency,
            },
          });
        },
        { op: 'billing.dispute_refund_reserve' },
      );
    } catch (e) {
      // Two deliveries at once: the first one holds the row and does the work.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return null;
      }
      throw e;
    }
  }

  /** The inquiry became a chargeback or closed: nothing may wait any more. */
  async onDisputeEnded(
    disputeId: string,
    reason: 'escalated' | 'closed',
  ): Promise<void> {
    const res = await this.prisma.billingDisputeRefund.updateMany({
      where: { dispute_id: disputeId, status: 'review' },
      data: { status: 'no_refund', reason },
    });
    if (res.count === 0) return;
    await this.review?.closeByRef(
      'dispute_refund',
      disputeId,
      `Not refunded: ${reason}`,
    );
  }

  /** A person approves a held refund (the admin call has passed 2FA). Limits
   * were for the automatic path; Stripe's rule still stands. */
  async approve(id: string, adminId: string): Promise<BillingDisputeRefund> {
    const row = await this.waiting(id);
    await refreshProvider(this.provider);
    // A first-charge cancel row has no bank behind it: Stripe's dispute rule
    // does not apply, the person's word is enough.
    const now = isFirstChargeCancelRef(row.dispute_id)
      ? null
      : await this.provider.retrieveDispute?.(null, row.dispute_id);
    if (
      !isFirstChargeCancelRef(row.dispute_id) &&
      (!now ||
        !inquiryRefundable({
          status: now.status,
          chargeRefundable: now.chargeRefundable === true,
        }))
    ) {
      await this.onDisputeEnded(row.dispute_id, 'escalated');
      throw new ConflictException({
        code: ErrorCode.REFUND_NOT_ALLOWED,
        message: 'The bank no longer allows a refund of this payment.',
      });
    }
    const claimed = await this.prisma.billingDisputeRefund.updateMany({
      where: { id, status: 'review' },
      data: { status: 'refunding', reason: null, decided_by: adminId },
    });
    if (claimed.count === 0) throw this.notWaiting();
    await this.settle(
      await this.prisma.billingDisputeRefund.findUniqueOrThrow({
        where: { id },
      }),
      true,
    );
    return this.prisma.billingDisputeRefund.findUniqueOrThrow({
      where: { id },
    });
  }

  /** A person decides not to refund (they will answer the bank instead). */
  async reject(
    id: string,
    adminId: string,
    note: string,
  ): Promise<BillingDisputeRefund> {
    const row = await this.waiting(id);
    const res = await this.prisma.billingDisputeRefund.updateMany({
      where: { id, status: 'review' },
      data: { status: 'rejected', decided_by: adminId, note },
    });
    if (res.count === 0) throw this.notWaiting();
    await this.review?.closeByRef('dispute_refund', row.dispute_id, note);
    return this.prisma.billingDisputeRefund.findUniqueOrThrow({
      where: { id },
    });
  }

  private async waiting(id: string): Promise<BillingDisputeRefund> {
    const row = await this.prisma.billingDisputeRefund.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Dispute refund not found.',
      });
    }
    if (row.status !== 'review') throw this.notWaiting();
    return row;
  }

  private notWaiting(): ConflictException {
    return new ConflictException({
      code: ErrorCode.REFUND_NOT_ALLOWED,
      message: 'This refund is no longer waiting for a decision.',
    });
  }

  /**
   * A row in `refunding`: finds its refund row (a crash may have left one);
   * none = Stripe was never asked, so the subscription is cancelled and the
   * refund sent (same key, same amount); a failure or an unknown outcome goes
   * to a person. A failed cancel throws: the webhook retries, no money moved.
   */
  private async settle(
    row: BillingDisputeRefund,
    send: boolean,
  ): Promise<void> {
    const found = await this.prisma.refund.findFirst({
      where: {
        payment_id: row.payment_id,
        reason: disputeRefundReason(row.dispute_id),
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, status: true, stripe_refund_id: true },
    });
    if (!found) {
      if (!send) return this.toReview(row, 'refund_unknown');
      if (!this.refunds) return this.toReview(row, 'refund_unavailable');
      await this.cancelSubscription(row);
      try {
        await this.refunds.refundBySystem(
          {
            paymentId: row.payment_id,
            amountCents: row.amount_cents,
            reason: disputeRefundReason(row.dispute_id),
          },
          { idempotencyKey: disputeRefundKey(row.dispute_id) },
        );
      } catch (e) {
        this.logger.warn(
          `dispute refund ${row.dispute_id} failed: ${String(e)}`,
        );
      }
      return this.settle(row, false);
    }
    if (found.status === 'failed') return this.toReview(row, 'refund_failed');
    if (!found.stripe_refund_id) return this.toReview(row, 'refund_unknown');
    const done = await this.prisma.billingDisputeRefund.update({
      where: { id: row.id },
      data: { status: 'refunded', reason: null, refund_id: found.id },
    });
    await this.review?.closeByRef(
      'dispute_refund',
      done.dispute_id,
      'Refunded',
    );
    await this.record(done, 'refunded', { refundId: found.id });
    try {
      await this.notifications.emit({
        type: 'subscription_status',
        recipientId: done.user_id,
        payload: {
          kind: 'dispute_refund',
          status: 'dispute_refund',
          refundCents: done.amount_cents,
          currency: done.currency,
        },
      });
    } catch (e) {
      // The money went back; a failed notice must not undo or repeat it.
      this.logger.warn(`dispute refund notice failed: ${String(e)}`);
    }
  }

  /** Cancels the subscription the disputed invoice belongs to, never blindly
   * the current one (they may have re-subscribed since). */
  private async cancelSubscription(row: BillingDisputeRefund): Promise<void> {
    const pay = await this.prisma.payment.findUnique({
      where: { id: row.payment_id },
      select: { stripe_invoice_id: true },
    });
    const sub = await this.prisma.subscription.findUnique({
      where: { user_id: row.user_id },
      select: { stripe_subscription_id: true },
    });
    const subId = sub?.stripe_subscription_id;
    if (!subId || !pay?.stripe_invoice_id) return;
    await refreshProvider(this.provider);
    const invoice = await this.provider.retrieveInvoice(pay.stripe_invoice_id);
    if (invoice?.subscriptionId !== subId) return;
    const now = await this.provider.retrieveSubscription(subId);
    const remote =
      !now || ENDED.has(now.status)
        ? now
        : await this.provider.cancelNow(subId, {
            idempotencyKey: `dispute:${row.dispute_id}:cancel`,
          });
    if (remote) await this.sync.apply(remote, {});
    await this.access.invalidate(row.user_id);
  }

  private async toReview(
    row: BillingDisputeRefund,
    reason: string,
  ): Promise<void> {
    const held = await this.prisma.billingDisputeRefund.update({
      where: { id: row.id },
      data: { status: 'review', reason },
    });
    await this.hold(held, null);
  }

  private async hold(
    row: BillingDisputeRefund,
    dueBy: number | null,
  ): Promise<void> {
    await this.review?.open({
      kind: 'dispute_refund',
      stripeRef: row.dispute_id,
      userId: row.user_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      summary: isFirstChargeCancelRef(row.dispute_id)
        ? `A refund of a first charge after a cancel waits for a decision (${row.reason ?? 'review'}): Admin → Платежи → «Возвраты по спорам».`
        : `A refund of a bank inquiry waits for a decision (${row.reason ?? 'review'}): answer in time, Admin → Платежи → «Возвраты по спорам».`,
      details: { reason: row.reason, paymentId: row.payment_id },
      dueAt: dueBy ? new Date(dueBy * 1000) : null,
    });
    await this.record(row, 'held', { reason: row.reason });
  }

  /** Suspended / being deleted, a fraud profile in review or worse, or a
   * verification taken away (as in the duplicate-subscription fix). */
  private async underReview(userId: string): Promise<boolean> {
    const [user, fraud, profile] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true },
      }),
      this.prisma.clientFraudProfile.findUnique({
        where: { user_id: userId },
        select: { status: true },
      }),
      this.prisma.attorneyProfile.findUnique({
        where: { user_id: userId },
        select: { verification_status: true },
      }),
    ]);
    return (
      !user ||
      user.status !== 'active' ||
      (!!fraud && FRAUD_HOLD_STATUSES.includes(fraud.status)) ||
      profile?.verification_status === 'rejected' ||
      profile?.verification_status === 'suspended'
    );
  }

  /** Audit row of a system action: audit_log.admin_id is a required FK to
   * users, so (the repo's convention) the person concerned stands in; the
   * `system.` prefix and `actor: 'system'` mark it as automatic. */
  private async record(
    row: BillingDisputeRefund,
    step: string,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    try {
      await this.audit?.record({
        adminId: row.user_id,
        action: `system.billing.dispute_refund.${step}`,
        targetType: 'billing_dispute_refund',
        targetId: row.id,
        after: {
          ...after,
          disputeId: row.dispute_id,
          paymentId: row.payment_id,
          amountCents: row.amount_cents,
          decidedBy: row.decided_by,
          actor: 'system',
        },
      });
    } catch (e) {
      this.logger.warn(`dispute refund audit row failed: ${String(e)}`);
    }
  }
}
