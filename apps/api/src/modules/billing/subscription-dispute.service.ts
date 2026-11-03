import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import { StripeReviewService } from '../stripe-ops/stripe-review.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER } from './billing.constants';
import { refreshProvider } from './dynamic-payment.provider';
import type { PaymentProvider, ProviderEvent } from './payment-provider';
import { SubscriptionSyncService } from './subscription-sync.service';

/** Subscription states in which nothing is left to cancel. */
const ENDED = new Set(['canceled', 'incomplete_expired']);
/** Real chargebacks (not inquiries `warning_*`); see onEvent. */
const CHARGEBACK_STATUSES = new Set(['needs_response', 'under_review', 'lost']);

/**
 * R-237 (owner 2026-11-03): a bank dispute (chargeback) on a SUBSCRIPTION
 * charge is handled automatically. Following Stripe's own guidance for
 * subscriptions (docs.stripe.com/disputes/how-disputes-work: a customer who
 * disputes a charge should not be billed again; the dispute itself already
 * pulls the disputed amount and the dispute fee from the balance):
 *
 *  - `charge.dispute.created`: the attorney's subscription is cancelled at
 *    Stripe NOW (`cancelNow`, key `dispute:<dispute>:cancel`, so no further
 *    charge can be attempted); the row is synced the usual way (access ends,
 *    the normal subscription notice goes out); an audit row and an e-mail to
 *    the super admins record it.
 *  - `charge.dispute.closed`: nothing is refunded or restored. `lost` = the
 *    bank kept the money; `won` = Stripe returns the money, the
 *    subscription stays cancelled (a person may re-enable access in the
 *    admin); both are recorded in the audit log.
 *
 * Money rule: NO refund is issued here. The dispute already reverses the
 * disputed charge, so a refund of the same charge would pay the customer
 * twice (Stripe: never refund a disputed charge). The unused remainder of a
 * DIFFERENT (later) paid period is not refunded automatically either: the
 * repo's refund guard (duplicate-subscriptions.logic `refundGuard`) holds
 * all automatic refunds for a user with a dispute; an admin refunds it by
 * hand from «Платежи и возвраты» after looking.
 *
 * Only an invoice charge we booked as a Payment counts as a subscription
 * charge (packs / boosts have no invoice; case payments are another flow and
 * never match). The dispute record for the admin («Проверки Stripe»,
 * scope platform) is opened by DisputeService.onPlatformDispute.
 * Idempotent: Stripe key per dispute, a repeat finds the subscription
 * already ended. Switch: `billing.dispute_auto_cancel` (on).
 */
@Injectable()
export class SubscriptionDisputeService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionDisputeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly settings: AppSettingsService,
    private readonly sync: SubscriptionSyncService,
    private readonly access: SubscriptionAccessService,
    @Optional() private readonly review?: StripeReviewService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  onModuleInit(): void {
    this.sync.setDisputeHook((event) => this.onEvent(event));
  }

  async onEvent(event: ProviderEvent): Promise<void> {
    if (
      event.type !== 'charge.dispute.created' &&
      event.type !== 'charge.dispute.updated' &&
      event.type !== 'charge.dispute.closed'
    )
      return;
    if (!(await this.settings.boolean('billing.dispute_auto_cancel'))) return;
    const o = event.object;
    const pi = typeof o.payment_intent === 'string' ? o.payment_intent : null;
    if (!pi) return;
    // Only the invoice charge of a subscription (see the class comment).
    const pay = await this.prisma.payment.findFirst({
      where: { stripe_payment_intent_id: pi, stripe_invoice_id: { not: null } },
      select: { id: true, user_id: true, stripe_invoice_id: true },
    });
    if (!pay) return;
    const dispute = {
      id: o.id,
      status: typeof o.status === 'string' ? o.status : 'needs_response',
      reason: typeof o.reason === 'string' ? o.reason : null,
      amount: typeof o.amount === 'number' ? o.amount : null,
    };
    const row = await this.prisma.subscription.findUnique({
      where: { user_id: pay.user_id },
    });
    if (event.type === 'charge.dispute.closed') {
      const outcome =
        dispute.status === 'lost'
          ? 'lost'
          : dispute.status === 'won'
            ? 'won'
            : 'closed';
      await this.record(row?.id ?? null, pay.user_id, `closed_${outcome}`, {
        disputeId: dispute.id,
        status: dispute.status,
        invoiceId: pay.stripe_invoice_id,
        refunded: false,
      });
      // A chargeback lost at the bank ends the subscription too (when an
      // earlier inquiry did not); the code below is idempotent.
      if (outcome !== 'lost') return;
    }

    if (!row?.stripe_subscription_id) {
      if (event.type !== 'charge.dispute.created') return;
      await this.record(null, pay.user_id, 'no_subscription', {
        disputeId: dispute.id,
        invoiceId: pay.stripe_invoice_id,
      });
      return;
    }
    const subId = row.stripe_subscription_id;
    const base = {
      disputeId: dispute.id,
      status: dispute.status,
      reason: dispute.reason,
      amountCents: dispute.amount,
      subscriptionId: subId,
      invoiceId: pay.stripe_invoice_id,
      refunded: false,
    };

    // Stripe dispute statuses (docs.stripe.com/api/disputes/object#dispute_object-status):
    // `warning_needs_response` / `warning_under_review` / `warning_closed` are
    // INQUIRIES (the bank asks, no money has moved); `needs_response` /
    // `under_review` / `won` / `lost` are real chargebacks; `prevented` is a
    // dispute stopped before it started. Only a real open chargeback
    // (`needs_response`, `under_review`) or `lost` cancels the subscription;
    // an inquiry is only recorded and the staff told (it may be answered).
    if (!CHARGEBACK_STATUSES.has(dispute.status)) {
      if (event.type === 'charge.dispute.created') {
        await this.record(row.id, pay.user_id, 'inquiry_noted', base);
        await this.alert(
          dispute.id,
          'LawBid: bank inquiry on a subscription charge',
          `A bank inquiry (${dispute.status}, ${dispute.reason ?? 'unknown'}) on an attorney's subscription charge. The subscription was NOT cancelled; answer the bank in time: Admin → Деньги → «Проверки Stripe».`,
        );
      }
      return;
    }

    await refreshProvider(this.provider);
    // Cancel the subscription the disputed invoice belongs to, never blindly
    // the attorney's current one (they may have re-subscribed since).
    const invoice = await this.provider.retrieveInvoice(pay.stripe_invoice_id!);
    if (!invoice?.subscriptionId || invoice.subscriptionId !== subId) {
      if (event.type === 'charge.dispute.created') {
        await this.record(row.id, pay.user_id, 'other_subscription', {
          ...base,
          invoiceSubscriptionId: invoice?.subscriptionId ?? null,
        });
        await this.alert(
          dispute.id,
          'LawBid: dispute on an older subscription charge',
          `A dispute (${dispute.status}) hit an invoice of subscription ${invoice?.subscriptionId ?? 'unknown'}, not the attorney's current ${subId}. Nothing was cancelled; look at it in «Проверки Stripe».`,
        );
      }
      return;
    }

    const now = await this.provider.retrieveSubscription(subId);
    const ended = !now || ENDED.has(now.status);
    let remote = now;
    if (!ended) {
      remote = await this.provider.cancelNow(subId, {
        idempotencyKey: `dispute:${dispute.id}:cancel`,
      });
    }
    // Idempotent heal: on a retry after a partial failure (cancelled at
    // Stripe, row not synced) the row and the access cache catch up here.
    if (remote) await this.sync.apply(remote, {});
    await this.access.invalidate(pay.user_id);
    // `updated` / `closed` fire often: stay quiet when nothing new.
    if (ended && event.type !== 'charge.dispute.created') return;
    await this.record(
      row.id,
      pay.user_id,
      ended ? 'already_canceled' : 'subscription_canceled',
      base,
    );
    if (!ended) {
      await this.alert(
        dispute.id,
        'LawBid: subscription cancelled after a bank dispute',
        `An attorney's subscription charge was disputed (${dispute.reason ?? 'unknown'}, ${dispute.status}). The subscription ${subId} was cancelled at once; no refund was made (the dispute reverses the charge).\n\nRespond to the dispute: Admin → Деньги → «Проверки Stripe».`,
      );
    }
  }

  private async alert(
    disputeId: string,
    subject: string,
    text: string,
  ): Promise<void> {
    await this.review
      ?.notifyStaff(`dispute-cancel:${disputeId}:${subject}`, subject, text)
      .catch(() => undefined);
  }

  /** Audit row of a system action. audit_log.admin_id is a required FK to
   * users and the repo has no system user, so (as in the duplicate-
   * subscription auto-fix, the only existing convention) the attorney
   * concerned stands in; the `system.` action prefix and `actor: 'system'`
   * mark it as automatic. */
  private async record(
    subscriptionId: string | null,
    userId: string,
    step: string,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    try {
      await this.audit?.record({
        adminId: userId,
        action: `system.billing.dispute.${step}`,
        targetType: 'subscription',
        targetId: subscriptionId,
        after: { ...after, actor: 'system' },
      });
    } catch (e) {
      this.logger.warn(`dispute audit row failed: ${String(e)}`);
    }
  }
}
