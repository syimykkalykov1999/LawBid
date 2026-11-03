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
      return;
    }

    if (!row?.stripe_subscription_id) {
      await this.record(null, pay.user_id, 'no_subscription', {
        disputeId: dispute.id,
        invoiceId: pay.stripe_invoice_id,
      });
      return;
    }
    await refreshProvider(this.provider);
    const subId = row.stripe_subscription_id;
    const now = await this.provider.retrieveSubscription(subId);
    let canceled = false;
    if (now && !ENDED.has(now.status)) {
      const remote = await this.provider.cancelNow(subId, {
        idempotencyKey: `dispute:${dispute.id}:cancel`,
      });
      await this.sync.apply(remote, {});
      await this.access.invalidate(pay.user_id);
      canceled = true;
    }
    await this.record(
      row.id,
      pay.user_id,
      canceled ? 'subscription_canceled' : 'already_canceled',
      {
        disputeId: dispute.id,
        status: dispute.status,
        reason: dispute.reason,
        amountCents: dispute.amount,
        subscriptionId: subId,
        invoiceId: pay.stripe_invoice_id,
        refunded: false,
      },
    );
    if (canceled) {
      await this.review
        ?.notifyStaff(
          `dispute-cancel:${dispute.id}`,
          'LawBid: subscription cancelled after a bank dispute',
          `An attorney's subscription charge was disputed (${dispute.reason ?? 'unknown'}, ${dispute.status}). The subscription ${subId} was cancelled at once; no refund was made (the dispute reverses the charge).\n\nRespond to the dispute: Admin → Деньги → «Проверки Stripe».`,
        )
        .catch(() => undefined);
    }
  }

  /** Audit row of a system action (audit_log needs a user as actor; the
   * attorney concerned stands in, action prefix `system.`). */
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
