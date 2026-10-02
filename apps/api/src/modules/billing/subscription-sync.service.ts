import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { BidsService } from '../bids/bids.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromotionsService } from '../promotions/promotions.service';
import { ReferralsService } from '../referrals/referrals.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER } from './billing.constants';
import type {
  PaymentProvider,
  ProviderEvent,
  ProviderSubscription,
} from './payment-provider';

const secs = (unix: number | null): Date | null =>
  unix ? new Date(unix * 1000) : null;

/**
 * docs/06 §1.5: the only writer of `subscriptions` after creation. Every
 * event re-reads the subscription from the provider and syncs the row
 * (events may arrive out of order); access transitions trigger the side
 * effects — active → inactive: bids withdrawn + `subscription_status`;
 * inactive → active: `subscription_status`; payment failure: `past_due`
 * with the grace deadline + `subscription_payment_failed`. The access
 * cache is dropped on every status change.
 */
@Injectable()
export class SubscriptionSyncService {
  private readonly logger = new Logger(SubscriptionSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly settings: AppSettingsService,
    private readonly access: SubscriptionAccessService,
    private readonly bids: BidsService,
    private readonly notifications: NotificationsService,
    // Owner 2026-10-02: referral qualification + paid case promotions.
    @Optional() private readonly referrals?: ReferralsService,
    @Optional() private readonly promotions?: PromotionsService,
  ) {}

  async handleEvent(event: ProviderEvent): Promise<void> {
    const o = event.object;
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncById(o.id);
        return;
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required':
        await this.onInvoice(o.id, event.type);
        return;
      case 'checkout.session.completed': {
        // Owner 2026-09-30: paid on Stripe's hosted page — sync the new
        // subscription (the app's /checkout/complete applies the card
        // trial rule too).
        const session = await this.provider.retrieveCheckoutSession(o.id);
        // Owner 2026-10-02: a one-time case-promotion payment.
        if (session?.metadata.kind === 'case_promotion') {
          await this.promotions?.applyCheckout(session);
          return;
        }
        if (session?.subscriptionId)
          await this.syncById(session.subscriptionId);
        return;
      }
      case 'setup_intent.succeeded':
        // The card is bound; POST /subscriptions/confirm reads it. Nothing
        // to sync yet.
        return;
      case 'charge.refunded':
        await this.onRefund(o.id);
        return;
      default:
        this.logger.debug(`ignored stripe event ${event.type}`);
    }
  }

  /** Re-read from the provider and reconcile the local row. */
  async syncById(providerSubscriptionId: string): Promise<Subscription | null> {
    const remote = await this.provider.retrieveSubscription(
      providerSubscriptionId,
    );
    if (!remote) {
      this.logger.warn(
        `subscription ${providerSubscriptionId} not found at provider`,
      );
      return null;
    }
    return this.apply(remote);
  }

  async apply(
    remote: ProviderSubscription,
    extra: Partial<Prisma.SubscriptionUpdateInput> = {},
  ): Promise<Subscription | null> {
    const graceDays = await this.settings.number(
      'subscription.past_due_grace_days',
    );
    let transition: 'lost' | 'gained' | null = null;
    let statusChanged = false;
    let previousStatus: string | null = null;
    const row = await withTxRetry(this.prisma, async (tx) => {
      const local =
        (await tx.subscription.findUnique({
          where: { stripe_subscription_id: remote.id },
        })) ?? (await this.byCustomer(tx, remote.customerId));
      if (!local) return null;
      // Audit 2026-10-01: an event of another (duplicate, cancelled)
      // subscription of the same customer never overwrites the live one.
      if (
        local.stripe_subscription_id &&
        local.stripe_subscription_id !== remote.id &&
        SubscriptionAccessService.rowIsActive(local)
      ) {
        return null;
      }
      const hadPayment =
        (await tx.payment.count({
          where: { user_id: local.user_id, status: 'succeeded' },
        })) > 0;
      const status = mapStatus(remote.status, hadPayment);
      const wasActive = SubscriptionAccessService.rowIsActive(local);
      previousStatus = local.status;
      const graceEndsAt =
        status === 'past_due'
          ? (local.grace_ends_at ??
            new Date(Date.now() + graceDays * 86_400_000))
          : null;
      const updated = await tx.subscription.update({
        where: { id: local.id },
        data: {
          stripe_subscription_id: remote.id,
          status,
          trial_started_at: secs(remote.trialStart) ?? local.trial_started_at,
          trial_ends_at: secs(remote.trialEnd) ?? local.trial_ends_at,
          current_period_start: secs(remote.currentPeriodStart),
          current_period_end: secs(remote.currentPeriodEnd),
          cancel_at_period_end: remote.cancelAtPeriodEnd,
          canceled_at: secs(remote.canceledAt),
          grace_ends_at: graceEndsAt,
          ...extra,
        },
      });
      const isActive = SubscriptionAccessService.rowIsActive(updated);
      statusChanged =
        local.status !== updated.status ||
        local.grace_ends_at?.getTime() !== updated.grace_ends_at?.getTime();
      transition =
        wasActive && !isActive
          ? 'lost'
          : !wasActive && isActive
            ? 'gained'
            : null;
      return updated;
    });
    if (!row) return null;
    if (statusChanged || transition) await this.access.invalidate(row.user_id);
    if (transition === 'lost') {
      // §1.5 "активна → неактивна": bids withdrawn, contacts closed by the gate.
      // Owner 2026-10-02: an active contract grant keeps access — bids stay.
      const covered = (await this.access.activeGrant(row.user_id)) !== null;
      const withdrawn = covered
        ? 0
        : await this.bids.withdrawActiveBidsForAttorney(row.user_id);
      await this.notify(row.user_id, 'subscription_status', {
        status: row.status,
        withdrawnBids: withdrawn,
      });
    } else if (transition === 'gained' && previousStatus !== 'incomplete') {
      // A fresh subscription (incomplete → trialing/active) is the user's
      // own action; only a re-activation is news worth a notification.
      await this.notify(row.user_id, 'subscription_status', {
        status: row.status,
      });
    }
    return row;
  }

  private async onInvoice(invoiceId: string, type: string): Promise<void> {
    const invoice = await this.provider.retrieveInvoice(invoiceId);
    if (!invoice) return;
    const sub = invoice.subscriptionId
      ? await this.prisma.subscription.findUnique({
          where: { stripe_subscription_id: invoice.subscriptionId },
        })
      : invoice.customerId
        ? await this.byCustomer(this.prisma, invoice.customerId)
        : null;
    if (!sub) return;
    const paid = type === 'invoice.paid';
    await this.prisma.payment.upsert({
      where: { stripe_invoice_id: invoice.id },
      create: {
        user_id: sub.user_id,
        stripe_invoice_id: invoice.id,
        stripe_payment_intent_id: invoice.paymentIntentId,
        amount_cents: invoice.amountCents,
        currency: invoice.currency,
        status: paid ? 'succeeded' : 'failed',
        paid_at: paid ? (secs(invoice.paidAt) ?? new Date()) : null,
        failure_code: paid ? null : (invoice.failureCode ?? type),
      },
      update: {
        stripe_payment_intent_id: invoice.paymentIntentId,
        amount_cents: invoice.amountCents,
        status: paid ? 'succeeded' : 'failed',
        paid_at: paid ? (secs(invoice.paidAt) ?? new Date()) : null,
        failure_code: paid ? null : (invoice.failureCode ?? type),
      },
    });
    if (!paid) {
      // docs/06 §8 "всплеск неуспешных платежей": metric filter on this line.
      this.logger.warn(
        { subscriptionId: sub.id, failureCode: invoice.failureCode ?? type },
        'subscription payment failed',
      );
      // §1.5: past_due + grace immediately, whatever the provider's own
      // dunning state says, and the attorney is told to fix the card.
      const graceDays = await this.settings.number(
        'subscription.past_due_grace_days',
      );
      const current = await this.prisma.subscription.findUnique({
        where: { id: sub.id },
      });
      if (
        current &&
        (current.status === 'active' ||
          current.status === 'trialing' ||
          current.status === 'past_due')
      ) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'past_due',
            grace_ends_at:
              current.grace_ends_at ??
              new Date(Date.now() + graceDays * 86_400_000),
          },
        });
        await this.access.invalidate(sub.user_id);
      }
      await this.notify(sub.user_id, 'subscription_payment_failed', {
        invoiceId: invoice.id,
        amountCents: invoice.amountCents,
        actionRequired: type === 'invoice.payment_action_required',
      });
      // No re-sync here: the provider's own `past_due` arrives with the
      // following customer.subscription.updated event; re-reading now
      // could still say `active` and undo the grace period.
      return;
    }
    // Owner 2026-10-02: the first paid invoice qualifies a referral (never
    // breaks billing).
    if (invoice.amountCents > 0) {
      try {
        await this.referrals?.onQualifyingEvent(
          sub.user_id,
          'subscription_payment',
        );
      } catch (e) {
        this.logger.warn(`referral hook failed: ${String(e)}`);
      }
    }
    if (sub.stripe_subscription_id)
      await this.syncById(sub.stripe_subscription_id);
  }

  private async onRefund(chargeId: string): Promise<void> {
    const charge = await this.provider.retrieveCharge(chargeId);
    if (!charge?.paymentIntentId || !charge.refunded) return;
    await this.prisma.payment.updateMany({
      where: { stripe_payment_intent_id: charge.paymentIntentId },
      data: { status: 'refunded' },
    });
  }

  private async byCustomer(
    db: Pick<Prisma.TransactionClient, 'subscription' | 'stripeCustomer'>,
    customerId: string,
  ) {
    const c = await db.stripeCustomer.findUnique({
      where: { stripe_customer_id: customerId },
    });
    return c
      ? db.subscription.findUnique({ where: { user_id: c.user_id } })
      : null;
  }

  private async notify(
    userId: string,
    type: 'subscription_status' | 'subscription_payment_failed',
    payload: Prisma.InputJsonObject,
  ) {
    try {
      await this.notifications.emit({ type, recipientId: userId, payload });
    } catch (e) {
      this.logger.error(`notification ${type} failed: ${String(e)}`);
    }
  }
}

/** docs/06 §1.3 statuses; `unpaid` / `incomplete_expired` → expired
 * (OQ-H), a cancellation without a single successful payment = a trial
 * that ended without a charge → expired. */
export function mapStatus(
  status: ProviderSubscription['status'],
  hadPayment: boolean,
): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
    case 'unpaid':
      return 'expired';
    case 'canceled':
    case 'paused':
      return hadPayment ? 'canceled' : 'expired';
    default:
      return 'expired';
  }
}
