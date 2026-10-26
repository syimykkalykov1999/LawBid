import { ClientBadgeService } from '../client-badge/client-badge.service';
import { ClientPlansService } from '../plans/client-plans.service';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma, Subscription, SubscriptionStatus } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { LedgerPostingService } from '../ledger/ledger.public';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { BidsService } from '../bids/bids.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BidPacksService } from '../bid-packs/bid-packs.service';
import { StarsService } from '../stars/stars.service';
import { STARS_CHECKOUT_KIND } from '../stars/stars.settings';
import { PromotionsService } from '../promotions/promotions.service';
import {
  CASE_PAYMENT_CHECKOUT_KIND,
  CasePaymentsService,
} from '../case-payments/case-payments.service';
import { ReferralsService } from '../referrals/referrals.service';
import { PartnersService } from '../partners/partners.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER } from './billing.constants';
import { PricingService } from './pricing.service';
import {
  PI_TAX_CALCULATION_KEY,
  PI_TAX_CENTS_KEY,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderSubscription,
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
    // Owner 2026-10-02: the client's paid gold badge.
    @Optional() private readonly clientBadges?: ClientBadgeService,
    // Owner 2026-10-05: client → attorney payments (Stripe Connect).
    @Optional() private readonly casePayments?: CasePaymentsService,
    // Owner 2026-10-05: a client's plan.
    @Optional() private readonly clientPlans?: ClientPlansService,
    // Owner 2026-10-05: partner commissions reversed on refunds.
    @Optional() private readonly partners?: PartnersService,
    // Owner 2026-10-14: offer packs.
    @Optional() private readonly bidPacks?: BidPacksService,
    @Optional() private readonly stars?: StarsService,
    // Owner 2026-10-22: finds the assistant-seat item on a subscription.
    @Optional() private readonly pricing?: PricingService,
    // Day-one foundations: the double-entry money ledger (same transaction).
    @Optional() private readonly ledger?: LedgerPostingService,
  ) {}

  async handleEvent(event: ProviderEvent): Promise<void> {
    const o = event.object;
    // Owner 2026-10-05: anything that happened on an attorney's connected
    // account (or a client → attorney checkout) belongs to case payments.
    const meta = o.metadata as Record<string, string> | undefined;
    if (
      typeof o._account === 'string' ||
      meta?.kind === CASE_PAYMENT_CHECKOUT_KIND ||
      event.type.startsWith('account.') ||
      event.type.startsWith('charge.dispute.')
    ) {
      await this.casePayments?.handleProviderEvent(event);
      return;
    }
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // A client's badge subscription is not an attorney's one.
        if (await this.clientBadges?.onSubscriptionEvent(o.id)) return;
        if (await this.clientPlans?.onSubscriptionEvent(o.id)) return;
        await this.syncById(o.id);
        return;
      // Owner 2026-10-22: a seat purchase waiting for its invoice (3-D
      // Secure) was paid and applied — or it expired / was voided.
      case 'customer.subscription.pending_update_applied':
      case 'customer.subscription.pending_update_expired':
        await this.onSeatUpdate(o.id);
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
        if (session?.metadata.kind === 'bid_pack') {
          await this.bidPacks?.applyCheckout(session);
          return;
        }
        if (session?.metadata.kind === STARS_CHECKOUT_KIND) {
          await this.stars?.applyCheckout(session);
          return;
        }
        if (session?.metadata.kind === 'client_badge') {
          await this.clientBadges?.applyCheckout(session);
          return;
        }
        if (session?.metadata.kind === 'client_plan') {
          await this.clientPlans?.applyCheckout(session);
          return;
        }
        if (session?.subscriptionId)
          await this.syncById(session.subscriptionId);
        return;
      }
      // Owner 2026-10-22: a Boost paid on our own card page (PaymentIntent,
      // no Checkout session). The page and the app's state read apply it
      // too; this covers a buyer who closed the page at once.
      case 'payment_intent.succeeded':
        if (meta?.kind === 'case_promotion') {
          await this.promotions?.applyCheckoutById(o.id);
        } else if (meta?.kind === STARS_CHECKOUT_KIND) {
          await this.stars?.applyCheckoutById(o.id);
        } else if (meta?.kind === 'bid_pack') {
          await this.bidPacks?.applyCheckoutById(o.id);
        }
        await this.recordPaymentIntentTax(o.id, meta ?? {});
        return;
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
    opts: { notify?: boolean } = {},
  ): Promise<Subscription | null> {
    // An admin action sends its own, fuller notice (opts.notify = false).
    const notify = opts.notify ?? true;
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
      const seats = await this.seatSync(tx, local, remote);
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
          ...seats,
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
      if (notify)
        await this.notify(row.user_id, 'subscription_status', {
          status: row.status,
          withdrawnBids: withdrawn,
        });
    } else if (transition === 'gained' && previousStatus !== 'incomplete') {
      // A fresh subscription (incomplete → trialing/active) is the user's
      // own action; only a re-activation is news worth a notification.
      if (notify)
        await this.notify(row.user_id, 'subscription_status', {
          status: row.status,
        });
    }
    return row;
  }

  /**
   * Owner 2026-10-22 (Stripe Tax): a one-time payment on our card page
   * carried a tax calculation — after the money arrived it becomes a tax
   * transaction (Stripe's reports) and the Payment row learns its tax.
   * Idempotent through the webhook event id; a second call for the same
   * intent is refused by Stripe with the same reference (ignored here).
   */
  private async recordPaymentIntentTax(
    paymentIntentId: string,
    meta: Record<string, string | undefined>,
  ): Promise<void> {
    const calculationId = meta[PI_TAX_CALCULATION_KEY];
    if (!calculationId) return;
    const taxCents = Number.parseInt(meta[PI_TAX_CENTS_KEY] ?? '', 10);
    try {
      await this.provider.recordTaxTransaction?.(
        calculationId,
        paymentIntentId,
      );
    } catch (e) {
      this.logger.warn(
        { paymentIntentId, err: (e as Error).message },
        'stripe tax transaction not recorded',
      );
    }
    if (Number.isFinite(taxCents)) {
      const rows = await this.prisma.payment.findMany({
        where: { stripe_payment_intent_id: paymentIntentId },
        select: { id: true, amount_cents: true },
      });
      for (const row of rows) {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: row.id },
            data: {
              tax_cents: taxCents,
              subtotal_cents: Math.max(0, row.amount_cents - taxCents),
            },
          });
          await this.ledger?.paymentTaxLearned(tx, row.id, taxCents);
        });
      }
    }
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
    // Owner 2026-10-22: the invoice of a seat purchase (charged at once).
    // An unpaid one never makes the subscription past_due — the seats are
    // simply not added (pending_if_incomplete); a paid one is a payment.
    const seatChange = await this.prisma.assistantSeatChange.findFirst({
      where: { stripe_invoice_id: invoice.id },
    });
    if (seatChange) {
      if (paid && seatChange.status !== 'paid') {
        await this.prisma.assistantSeatChange.update({
          where: { id: seatChange.id },
          data: { status: 'paid', amount_cents: invoice.amountCents },
        });
      } else if (
        type === 'invoice.payment_failed' &&
        seatChange.status === 'pending'
      ) {
        await this.prisma.assistantSeatChange.update({
          where: { id: seatChange.id },
          data: { status: 'failed' },
        });
      }
      if (!paid) return;
    }
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.upsert({
        where: { stripe_invoice_id: invoice.id },
        create: {
          user_id: sub.user_id,
          stripe_invoice_id: invoice.id,
          stripe_payment_intent_id: invoice.paymentIntentId,
          amount_cents: invoice.amountCents,
          tax_cents: invoice.taxCents ?? null,
          subtotal_cents: invoice.subtotalCents ?? null,
          currency: invoice.currency,
          status: paid ? 'succeeded' : 'failed',
          paid_at: paid ? (secs(invoice.paidAt) ?? new Date()) : null,
          failure_code: paid ? null : (invoice.failureCode ?? type),
        },
        update: {
          stripe_payment_intent_id: invoice.paymentIntentId,
          amount_cents: invoice.amountCents,
          tax_cents: invoice.taxCents ?? null,
          subtotal_cents: invoice.subtotalCents ?? null,
          status: paid ? 'succeeded' : 'failed',
          paid_at: paid ? (secs(invoice.paidAt) ?? new Date()) : null,
          failure_code: paid ? null : (invoice.failureCode ?? type),
        },
      });
      // The money event and its ledger entry commit together (idempotent).
      if (paid) {
        await this.ledger?.paymentReceived(
          tx,
          payment,
          'revenue_subscriptions',
        );
      }
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

  /** Owner 2026-10-22: `pending_update_applied` / `_expired` — settle the
   * attorney's waiting seat purchases from their invoices, then re-read
   * the subscription (its seat quantity). */
  private async onSeatUpdate(providerSubscriptionId: string): Promise<void> {
    const local = await this.prisma.subscription.findUnique({
      where: { stripe_subscription_id: providerSubscriptionId },
      select: { user_id: true },
    });
    if (local) await this.reconcileSeatChanges(local.user_id);
    await this.syncById(providerSubscriptionId);
  }

  /** Waiting seat purchases (last 3 days) take their invoice's outcome:
   * paid → paid; void / uncollectible → expired. */
  async reconcileSeatChanges(userId: string): Promise<void> {
    const rows = await this.prisma.assistantSeatChange.findMany({
      where: {
        user_id: userId,
        status: { in: ['pending', 'failed'] },
        stripe_invoice_id: { not: null },
        created_at: { gte: new Date(Date.now() - 3 * 86_400_000) },
      },
    });
    for (const r of rows) {
      const inv = await this.provider.retrieveInvoice(r.stripe_invoice_id!);
      if (!inv) continue;
      const next =
        inv.status === 'paid'
          ? 'paid'
          : inv.status === 'void' || inv.status === 'uncollectible'
            ? 'expired'
            : null;
      if (next && next !== r.status) {
        await this.prisma.assistantSeatChange.update({
          where: { id: r.id },
          data: {
            status: next,
            ...(next === 'paid' ? { amount_cents: inv.amountCents } : {}),
          },
        });
      }
    }
  }

  /**
   * Owner 2026-10-22: `assistant_seats` follows the seat item's quantity
   * on Stripe (a purchase applied after 3-D Secure, a change made in the
   * Stripe Dashboard). A removal waiting for the period end keeps the
   * paid seats until then (Stripe's quantity is already lower so the next
   * invoice is right); from the period end the lower number applies.
   * Yearly rows and subscriptions without a known seat item are left as
   * they are.
   */
  private async seatSync(
    tx: Prisma.TransactionClient,
    local: Subscription,
    remote: ProviderSubscription,
  ): Promise<Partial<Prisma.SubscriptionUpdateInput>> {
    if (!remote.items || !this.pricing || local.plan === 'yearly') return {};
    const ids = new Set(await this.pricing.allSeatPriceIds());
    const items = remote.items.filter((i) => ids.has(i.priceId));
    const scheduled = await tx.assistantSeatChange.findFirst({
      where: { user_id: local.user_id, status: 'scheduled' },
      orderBy: { created_at: 'desc' },
    });
    let qty: number;
    if (items.length > 0) qty = items.reduce((n, i) => n + i.quantity, 0);
    else if (scheduled?.to_seats === 0) qty = 0;
    else return {};
    const now = new Date();
    const due = !!scheduled && (scheduled.effective_at ?? now) <= now;
    if (qty < local.assistant_seats && scheduled && !due) return {};
    if (scheduled && due && qty <= local.assistant_seats) {
      await tx.assistantSeatChange.update({
        where: { id: scheduled.id },
        data: { status: 'applied' },
      });
    }
    if (qty === local.assistant_seats) return {};
    const unit =
      items.find((i) => i.unitAmountCents != null)?.unitAmountCents ?? 0;
    return {
      assistant_seats: qty,
      price_cents: Math.max(
        0,
        local.price_cents + (qty - local.assistant_seats) * unit,
      ),
    };
  }

  private async onRefund(chargeId: string): Promise<void> {
    const charge = await this.provider.retrieveCharge(chargeId);
    if (!charge?.paymentIntentId || !charge.refunded) return;
    const refunded = await this.prisma.payment.findMany({
      where: { stripe_payment_intent_id: charge.paymentIntentId },
      select: { id: true, user_id: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { stripe_payment_intent_id: charge.paymentIntentId! },
        data: { status: 'refunded' },
      });
      // What the ledger has not seen yet (the admin refund books its own).
      for (const p of refunded) {
        await this.ledger?.paymentRefundSynced(tx, {
          paymentId: p.id,
          userId: p.user_id,
          totalRefundedCents: charge.amountRefundedCents,
        });
      }
    });
    // Owner 2026-10-20: a refunded stars top-up takes its stars back (debt
    // when they are spent; never a negative balance).
    try {
      await this.stars?.refundPayments(refunded.map((p) => p.id));
    } catch (e) {
      this.logger.error(`stars refund failed: ${String(e)}`);
    }
    // Owner 2026-10-05: a refunded subscription payment takes back the
    // partner's commission for that attorney (never breaks billing).
    for (const userId of new Set(refunded.map((p) => p.user_id))) {
      await this.partners?.reverseForReferredUser(userId, 'payment_refunded');
    }
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
