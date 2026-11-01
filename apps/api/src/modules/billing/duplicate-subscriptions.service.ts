import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { BillingDuplicateFix, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { OpsStateService } from '../../common/ops/ops-state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  LIVE_REFUND_STATUSES,
  RefundsService,
} from '../admin-billing/refunds.service';
import { StripeReviewService } from '../stripe-ops/stripe-review.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER } from './billing.constants';
import { refreshProvider } from './dynamic-payment.provider';
import {
  attorneyLiveSubscriptions,
  DUPLICATE_WINDOW_DAYS,
  duplicateActionKey,
  duplicateRefundCents,
  duplicateRefundReason,
  type DuplicateCandidate,
  LIVE_SUBSCRIPTION_STATUSES,
  pickKeeper,
  refundGuard,
  tooManyDuplicates,
} from './duplicate-subscriptions.logic';
import type { PaymentProvider, ProviderSubscription } from './payment-provider';
import { SubscriptionSyncService } from './subscription-sync.service';

export type DuplicateTrigger = 'app_order' | 'webhook' | 'grace_resubscribe';

export interface DuplicateResolveResult {
  /** The subscription that stays (null: the attorney has none live). */
  keeperId: string | null;
  /** Duplicates cancelled in this run. */
  canceled: string[];
  outcome: 'none' | 'fixed' | 'blocked' | 'held' | 'off';
}

/** Statuses after which nothing more happens automatically. */
const FINAL = new Set(['refunded', 'no_refund', 'review', 'blocked']);
const LOCK_TTL_MS = 120_000;
const LOCK_WAIT_MS = 20_000;
const DAY_MS = 86_400_000;
const FRAUD_HOLD_STATUSES = ['review', 'restricted', 'banned'];

const sec = (d: Date | null | undefined): number | null =>
  d ? Math.floor(d.getTime() / 1000) : null;

/**
 * Algo audit M-4 (owner 2026-10-28): «handle it AUTOMATICALLY, but make sure
 * nobody can cheat us, use the service for free, or steal money».
 *
 * When one attorney has two live Stripe subscriptions of the plan (bought
 * again from a second device, or re-subscribed after grace while the old one
 * still retries its card), exactly ONE stays — the newest successfully paid
 * one — and every other one is cancelled at once; then (never before) only
 * the unused remainder of the cancelled one's LAST paid invoice is refunded.
 * Access is recomputed from Stripe for the kept subscription.
 *
 * Guards (duplicate-subscriptions.logic.ts): other customers / users are
 * never touched; no refund on a disputed charge, an account under fraud
 * review, above the original charge or above the daily cap (those wait in
 * «Проверки Stripe»); the 3rd duplicate within 90 days stops the automation
 * (alert only). Every step is idempotent: one `billing_duplicate_fixes` row
 * per duplicate, a per-attorney Redis lock, Stripe keys
 * `dupsub:<subscription>:cancel|refund`, the refund amount computed from the
 * cancel moment (identical on every retry). Switch:
 * `billing.duplicate_subscription_autofix` (on). The owner is alerted either
 * way.
 */
@Injectable()
export class DuplicateSubscriptionsService implements OnModuleInit {
  private readonly logger = new Logger(DuplicateSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly settings: AppSettingsService,
    private readonly sync: SubscriptionSyncService,
    private readonly access: SubscriptionAccessService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly refunds?: RefundsService,
    @Optional() private readonly review?: StripeReviewService,
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly ops?: OpsStateService,
  ) {}

  onModuleInit(): void {
    this.sync.setForeignSubscriptionHook((userId, subscriptionId) =>
      this.resolve(userId, { trigger: 'webhook', include: [subscriptionId] }),
    );
  }

  enabled(): Promise<boolean> {
    return this.settings.boolean('billing.duplicate_subscription_autofix');
  }

  /**
   * Finds and fixes the attorney's duplicates (see the class comment).
   * [include]: subscription ids known to the caller (the newcomer of a
   * checkout, the subscription of a webhook) — looked up even when the
   * provider cannot list a customer's subscriptions.
   */
  async resolve(
    userId: string,
    ctx: { trigger: DuplicateTrigger; include?: string[] },
  ): Promise<DuplicateResolveResult> {
    const token = await this.lock(userId);
    try {
      await refreshProvider(this.provider);
      await this.resumePending(userId);
      return await this.detectAndFix(userId, ctx);
    } finally {
      await this.unlock(userId, token);
    }
  }

  /**
   * The switch is off and the old rule ran (the newcomer of a second
   * checkout cancelled, nothing refunded): the case is recorded and a
   * person decides on the money.
   */
  async recordLegacyCancel(
    userId: string,
    canceledId: string,
    keptId: string,
  ): Promise<void> {
    try {
      const fix = await this.claim(userId, keptId, canceledId, 'app_order');
      if (!fix || FINAL.has(fix.status)) return;
      const row = await this.prisma.billingDuplicateFix.update({
        where: { id: fix.id },
        data: {
          status: 'review',
          reason: 'switch_off',
          canceled_at: new Date(),
        },
      });
      await this.hold(row, 'switch_off', 0);
    } catch (e) {
      this.logger.error(`duplicate legacy record failed: ${String(e)}`);
    }
  }

  // ---- detection ------------------------------------------------------------

  private async detectAndFix(
    userId: string,
    ctx: { trigger: DuplicateTrigger; include?: string[] },
  ): Promise<DuplicateResolveResult> {
    const local = await this.prisma.subscription.findUnique({
      where: { user_id: userId },
    });
    const none = (keeperId: string | null): DuplicateResolveResult => ({
      keeperId,
      canceled: [],
      outcome: 'none',
    });
    const customer = await this.prisma.stripeCustomer.findUnique({
      where: { user_id: userId },
    });
    if (!customer) return none(local?.stripe_subscription_id ?? null);
    const subs = await this.customerSubscriptions(customer.stripe_customer_id, [
      local?.stripe_subscription_id,
      ...(ctx.include ?? []),
    ]);
    const live = attorneyLiveSubscriptions(subs.map(baseCandidate), {
      userId,
      customerId: customer.stripe_customer_id,
    });
    if (live.length < 2) return none(live[0]?.id ?? null);

    for (const c of live) c.lastPaid = await this.lastPaidOf(c);
    const keeper = pickKeeper(live)!;
    const dups = live.filter((c) => c.id !== keeper.id);

    if (!(await this.enabled())) {
      for (const d of dups) {
        const fix = await this.claim(userId, keeper.id, d.id, ctx.trigger, d);
        if (!fix || FINAL.has(fix.status)) continue;
        const row = await this.prisma.billingDuplicateFix.update({
          where: { id: fix.id },
          data: { status: 'review', reason: 'switch_off' },
        });
        await this.hold(row, 'switch_off', 0);
      }
      return {
        keeperId: local?.stripe_subscription_id ?? keeper.id,
        canceled: [],
        outcome: 'off',
      };
    }

    // "N > 2 → stop auto": the attorney's earlier auto-fixes in 90 days.
    const prior = await this.prisma.billingDuplicateFix.count({
      where: {
        user_id: userId,
        status: { not: 'blocked' },
        created_at: {
          gte: new Date(Date.now() - DUPLICATE_WINDOW_DAYS * DAY_MS),
        },
        duplicate_subscription_id: { notIn: dups.map((d) => d.id) },
      },
    });
    const stop = tooManyDuplicates(prior);

    const canceled: string[] = [];
    let held = false;
    for (const d of dups) {
      const existing = await this.prisma.billingDuplicateFix.findUnique({
        where: { duplicate_subscription_id: d.id },
      });
      if (existing && FINAL.has(existing.status)) {
        if (existing.status === 'blocked') held = true;
        continue;
      }
      if (stop && (!existing || existing.status === 'pending')) {
        const fix =
          existing ??
          (await this.claim(userId, keeper.id, d.id, ctx.trigger, d));
        if (!fix || FINAL.has(fix.status)) continue;
        const row = await this.prisma.billingDuplicateFix.update({
          where: { id: fix.id },
          data: { status: 'blocked', reason: 'nth_duplicate' },
        });
        await this.hold(row, 'nth_duplicate', 0);
        held = true;
        continue;
      }
      const fix =
        existing ?? (await this.claim(userId, keeper.id, d.id, ctx.trigger, d));
      if (!fix || FINAL.has(fix.status)) continue;

      // Never leave the attorney without a live subscription: the kept one
      // is re-read from Stripe right before the other one is cancelled.
      const keeperNow = await this.provider.retrieveSubscription(keeper.id);
      if (
        !keeperNow ||
        !LIVE_SUBSCRIPTION_STATUSES.includes(keeperNow.status)
      ) {
        const row = await this.prisma.billingDuplicateFix.update({
          where: { id: fix.id },
          data: { status: 'review', reason: 'keeper_not_live' },
        });
        await this.hold(row, 'keeper_not_live', 0);
        return { keeperId: null, canceled, outcome: 'held' };
      }
      const after = await this.cancel(fix);
      if (!after) continue;
      canceled.push(d.id);
    }

    // Access follows the kept subscription, re-read from Stripe.
    if (canceled.length > 0) await this.pointRowAt(userId, keeper.id);
    // Then (never before the cancel) the money.
    for (const id of canceled) {
      const fix = await this.prisma.billingDuplicateFix.findUnique({
        where: { duplicate_subscription_id: id },
      });
      if (fix) await this.refundStep(fix);
    }
    if (canceled.length > 0) await this.alertFixed(userId, keeper.id, canceled);
    return {
      keeperId: keeper.id,
      canceled,
      outcome: canceled.length > 0 ? 'fixed' : held ? 'blocked' : 'none',
    };
  }

  /** The customer's subscriptions plus the ids the caller knows of. */
  private async customerSubscriptions(
    customerId: string,
    known: (string | null | undefined)[],
  ): Promise<ProviderSubscription[]> {
    const out: ProviderSubscription[] =
      typeof this.provider.listCustomerSubscriptions === 'function'
        ? await this.provider.listCustomerSubscriptions(customerId, 20)
        : [];
    for (const id of new Set(known.filter((x): x is string => !!x))) {
      if (out.some((s) => s.id === id)) continue;
      const s = await this.provider.retrieveSubscription(id);
      if (s) out.push(s);
    }
    return out;
  }

  /** The latest invoice when it is paid, with money, of this subscription. */
  private async lastPaidOf(
    c: DuplicateCandidate & { latestInvoiceId?: string | null },
  ): Promise<DuplicateCandidate['lastPaid']> {
    if (!c.latestInvoiceId) return null;
    const inv = await this.provider.retrieveInvoice(c.latestInvoiceId);
    if (
      !inv ||
      inv.status !== 'paid' ||
      inv.amountCents <= 0 ||
      inv.subscriptionId !== c.id
    ) {
      return null;
    }
    return {
      invoiceId: inv.id,
      amountCents: inv.amountCents,
      paidAt: inv.paidAt,
      paymentIntentId: inv.paymentIntentId,
      currency: inv.currency,
    };
  }

  // ---- the steps ------------------------------------------------------------

  /** One row per duplicate; a concurrent / retried claim gets the same row. */
  private async claim(
    userId: string,
    keptId: string,
    duplicateId: string,
    trigger: DuplicateTrigger,
    d?: DuplicateCandidate,
  ): Promise<BillingDuplicateFix | null> {
    try {
      return await this.prisma.billingDuplicateFix.create({
        data: {
          user_id: userId,
          kept_subscription_id: keptId,
          duplicate_subscription_id: duplicateId,
          trigger,
          status: 'pending',
          charged_cents: d?.lastPaid?.amountCents ?? 0,
          currency: d?.lastPaid?.currency ?? 'usd',
          stripe_invoice_id: d?.lastPaid?.invoiceId ?? null,
        },
      });
    } catch (e) {
      if ((e as { code?: string } | null)?.code !== 'P2002') throw e;
      return this.prisma.billingDuplicateFix.findUnique({
        where: { duplicate_subscription_id: duplicateId },
      });
    }
  }

  /** Cancels the duplicate now (idempotent); the row becomes `canceled`. */
  private async cancel(
    fix: BillingDuplicateFix,
  ): Promise<BillingDuplicateFix | null> {
    if (fix.status !== 'pending') return fix;
    const now = await this.provider.retrieveSubscription(
      fix.duplicate_subscription_id,
    );
    let canceledAt = new Date();
    if (
      now &&
      now.status !== 'canceled' &&
      now.status !== 'incomplete_expired'
    ) {
      const done = await this.provider.cancelNow(
        fix.duplicate_subscription_id,
        {
          idempotencyKey: duplicateActionKey(
            fix.duplicate_subscription_id,
            'cancel',
          ),
        },
      );
      if (done.canceledAt) canceledAt = new Date(done.canceledAt * 1000);
    } else if (now?.canceledAt) {
      canceledAt = new Date(now.canceledAt * 1000);
    }
    const row = await this.prisma.billingDuplicateFix.update({
      where: { id: fix.id },
      data: { status: 'canceled', canceled_at: canceledAt },
    });
    await this.record(row, 'canceled', {
      kept: row.kept_subscription_id,
      duplicate: row.duplicate_subscription_id,
      trigger: row.trigger,
    });
    return row;
  }

  /** The attorney's row (and so access) follows the kept subscription. */
  private async pointRowAt(userId: string, keeperId: string): Promise<void> {
    const keeper = await this.provider.retrieveSubscription(keeperId);
    if (!keeper) return;
    await this.prisma.subscription.updateMany({
      where: { user_id: userId, NOT: { stripe_subscription_id: keeperId } },
      data: { stripe_subscription_id: keeperId },
    });
    await this.sync.apply(keeper, {}, { notify: false });
    await this.access.invalidate(userId);
  }

  /**
   * The money: only the unused remainder of the duplicate's last paid
   * invoice, computed at the cancel moment, after every guard; reserved
   * against the daily cap in one serializable transaction.
   */
  private async refundStep(fix: BillingDuplicateFix): Promise<void> {
    if (fix.status === 'refunding') {
      await this.settleRefunding(fix, true);
      return;
    }
    if (fix.status !== 'canceled') return;
    const dupId = fix.duplicate_subscription_id;
    if (!fix.stripe_invoice_id || fix.charged_cents <= 0) {
      await this.finishNoRefund(fix, 'no_charge');
      return;
    }
    const [dup, keeper] = await Promise.all([
      this.provider.retrieveSubscription(dupId),
      this.provider.retrieveSubscription(fix.kept_subscription_id),
    ]);
    const payment = await this.prisma.payment.findUnique({
      where: { stripe_invoice_id: fix.stripe_invoice_id },
    });
    const refunded = payment
      ? await this.prisma.refund.aggregate({
          where: {
            payment_id: payment.id,
            status: { in: LIVE_REFUND_STATUSES },
          },
          _sum: { amount_cents: true },
        })
      : null;
    const charged = payment
      ? Math.min(fix.charged_cents, payment.amount_cents)
      : fix.charged_cents;
    const { cents, reason } = duplicateRefundCents({
      chargedCents: charged,
      alreadyRefundedCents: refunded?._sum.amount_cents ?? 0,
      periodStart: dup?.currentPeriodStart ?? null,
      periodEnd: dup?.currentPeriodEnd ?? null,
      keeperPeriodStart: keeper?.currentPeriodStart ?? null,
      nowSec: sec(fix.canceled_at) ?? Math.floor(Date.now() / 1000),
    });
    if (reason || cents <= 0) {
      await this.finishNoRefund(fix, reason ?? 'no_charge', payment?.id);
      return;
    }
    if (!payment) {
      // invoice.paid not booked yet: its webhook resumes this row.
      if (fix.reason !== 'payment_not_recorded') {
        await this.prisma.billingDuplicateFix.update({
          where: { id: fix.id },
          data: { reason: 'payment_not_recorded' },
        });
      }
      return;
    }
    const disputed =
      (payment.stripe_payment_intent_id &&
      typeof this.provider.paymentIntentDisputed === 'function'
        ? await this.provider.paymentIntentDisputed(
            payment.stripe_payment_intent_id,
          )
        : false) || (await this.hadDispute(fix.user_id));
    const fraudReview = await this.underFraudReview(fix.user_id);
    const cap = Math.max(
      0,
      await this.settings.number(
        'billing.duplicate_autorefund_daily_cap_cents',
      ),
    );
    const sameAccount =
      payment.user_id === fix.user_id &&
      (dup === null ||
        !dup.metadata.userId ||
        dup.metadata.userId === fix.user_id);

    const decided = await withTxRetry(
      this.prisma,
      async (tx) => {
        const cur = await tx.billingDuplicateFix.findUnique({
          where: { id: fix.id },
        });
        if (!cur || cur.status !== 'canceled') return null;
        const dayStart = new Date(new Date().toISOString().slice(0, 10));
        const today = await tx.billingDuplicateFix.aggregate({
          where: {
            status: { in: ['refunding', 'refunded'] },
            updated_at: { gte: dayStart },
          },
          _sum: { refund_cents: true },
        });
        const guard = refundGuard({
          sameAccount,
          disputed,
          fraudReview,
          refundCents: cents,
          chargedCents: charged,
          refundedTodayCents: today._sum.refund_cents ?? 0,
          dailyCapCents: cap,
        });
        return tx.billingDuplicateFix.update({
          where: { id: fix.id },
          data: guard
            ? {
                status: 'review',
                reason: guard,
                refund_cents: cents,
                payment_id: payment.id,
              }
            : {
                status: 'refunding',
                reason: null,
                refund_cents: cents,
                payment_id: payment.id,
              },
        });
      },
      { op: 'billing.duplicate_refund_reserve' },
    );
    if (!decided) return;
    if (decided.status === 'review') {
      await this.hold(decided, decided.reason ?? 'review', cents);
      return;
    }
    await this.settleRefunding(decided, true);
  }

  /**
   * A row in `refunding`: finds its refund row (a crash may have left one);
   * none = Stripe was never asked, so the refund is sent (same key, same
   * amount); a failed one or an unknown outcome goes to a person.
   */
  private async settleRefunding(
    fix: BillingDuplicateFix,
    send: boolean,
  ): Promise<void> {
    const found = await this.findRefund(fix);
    if (found === 'none' && send) {
      if (!this.refunds || !fix.payment_id) {
        await this.toReview(fix, 'refund_unavailable');
        return;
      }
      try {
        await this.refunds.refundBySystem(
          {
            paymentId: fix.payment_id,
            amountCents: fix.refund_cents,
            reason: duplicateRefundReason(fix.duplicate_subscription_id),
          },
          {
            idempotencyKey: duplicateActionKey(
              fix.duplicate_subscription_id,
              'refund',
            ),
          },
        );
      } catch (e) {
        this.logger.warn(
          `duplicate refund ${fix.duplicate_subscription_id} failed: ${String(e)}`,
        );
      }
      await this.settleRefunding(fix, false);
      return;
    }
    if (found === 'none') {
      await this.toReview(fix, 'refund_unknown');
      return;
    }
    if (found.status === 'failed') {
      await this.toReview(fix, 'refund_failed');
      return;
    }
    if (!found.stripe_refund_id) {
      await this.toReview(fix, 'refund_unknown');
      return;
    }
    const row = await this.prisma.billingDuplicateFix.update({
      where: { id: fix.id },
      data: { status: 'refunded', refund_id: found.id, reason: null },
    });
    await this.record(row, 'refunded', {
      duplicate: row.duplicate_subscription_id,
      refundCents: row.refund_cents,
      chargedCents: row.charged_cents,
      paymentId: row.payment_id,
      refundId: found.id,
    });
    await this.ops
      ?.noteBillingDuplicate('fixed', row.refund_cents)
      .catch(() => undefined);
  }

  private async findRefund(
    fix: BillingDuplicateFix,
  ): Promise<
    'none' | { id: string; status: string; stripe_refund_id: string | null }
  > {
    if (!fix.payment_id) return 'none';
    const r = await this.prisma.refund.findFirst({
      where: {
        payment_id: fix.payment_id,
        reason: duplicateRefundReason(fix.duplicate_subscription_id),
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, status: true, stripe_refund_id: true },
    });
    return r ?? 'none';
  }

  private async finishNoRefund(
    fix: BillingDuplicateFix,
    reason: string,
    paymentId?: string,
  ): Promise<void> {
    const row = await this.prisma.billingDuplicateFix.update({
      where: { id: fix.id },
      data: {
        status: 'no_refund',
        reason,
        ...(paymentId ? { payment_id: paymentId } : {}),
      },
    });
    await this.record(row, 'no_refund', {
      duplicate: row.duplicate_subscription_id,
      reason,
    });
    await this.ops?.noteBillingDuplicate('fixed', 0).catch(() => undefined);
  }

  private async toReview(fix: BillingDuplicateFix, reason: string) {
    const row = await this.prisma.billingDuplicateFix.update({
      where: { id: fix.id },
      data: { status: 'review', reason },
    });
    await this.hold(row, reason, row.refund_cents);
  }

  /** Rows a crash or a missing payment left half-way. */
  private async resumePending(userId: string): Promise<void> {
    const rows = await this.prisma.billingDuplicateFix.findMany({
      where: {
        user_id: userId,
        status: { in: ['pending', 'canceled', 'refunding'] },
      },
      take: 10,
    });
    for (const row of rows) {
      if (row.status === 'pending') {
        // Cancelled at Stripe but the row was not updated (crash): finish
        // it; a still-live one is handled by the detection below.
        const s = await this.provider.retrieveSubscription(
          row.duplicate_subscription_id,
        );
        if (s?.status !== 'canceled') continue;
        const done = await this.cancel(row);
        if (done) await this.refundStep(done);
        continue;
      }
      await this.refundStep(row);
    }
  }

  // ---- guards ---------------------------------------------------------------

  /** Any chargeback / early fraud warning ever seen on this account. */
  private async hadDispute(userId: string): Promise<boolean> {
    return (
      (await this.prisma.stripeReviewItem.count({
        where: {
          user_id: userId,
          kind: { in: ['dispute', 'early_fraud_warning'] },
        },
      })) > 0
    );
  }

  /** Suspended / being deleted, a fraud profile in review or worse, or a
   * verification taken away. */
  private async underFraudReview(userId: string): Promise<boolean> {
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

  // ---- records and alerts -------------------------------------------------------

  /** A person decides: «Проверки Stripe» item (mails the owner) + «Сегодня». */
  private async hold(
    row: BillingDuplicateFix,
    reason: string,
    cents: number,
  ): Promise<void> {
    await this.record(row, row.status === 'blocked' ? 'blocked' : 'held', {
      duplicate: row.duplicate_subscription_id,
      kept: row.kept_subscription_id,
      reason,
      refundCents: cents,
    });
    await this.ops
      ?.noteBillingDuplicate(
        row.status === 'blocked' ? 'blocked' : 'needsReview',
      )
      .catch(() => undefined);
    const canceled = row.canceled_at !== null;
    const money = (cents / 100).toFixed(2);
    await this.review
      ?.open({
        kind: 'duplicate_subscription',
        stripeRef: row.duplicate_subscription_id,
        userId: row.user_id,
        amountCents: cents || row.charged_cents || null,
        currency: row.currency,
        summary:
          `Duplicate subscription ${row.duplicate_subscription_id} (kept ${row.kept_subscription_id}): ` +
          (canceled ? 'cancelled; ' : 'NOT cancelled (both still bill); ') +
          `no automatic refund (${reason})` +
          (cents > 0 ? `, proposed refund $${money}.` : '.'),
        details: {
          fixId: row.id,
          reason,
          kept: row.kept_subscription_id,
          duplicate: row.duplicate_subscription_id,
          chargedCents: row.charged_cents,
          proposedRefundCents: cents,
          paymentId: row.payment_id,
        },
      })
      .catch((e) => this.logger.warn(`review item failed: ${String(e)}`));
  }

  private async alertFixed(
    userId: string,
    keeperId: string,
    canceled: string[],
  ): Promise<void> {
    const rows = await this.prisma.billingDuplicateFix.findMany({
      where: { duplicate_subscription_id: { in: canceled } },
    });
    const lines = rows.map(
      (r) =>
        `${r.duplicate_subscription_id}: ${r.status}` +
        (r.refund_cents > 0
          ? `, refund $${(r.refund_cents / 100).toFixed(2)}`
          : '') +
        (r.reason ? ` (${r.reason})` : ''),
    );
    await this.review
      ?.notifyStaff(
        `dupsub:${userId}`,
        'LawBid: duplicate subscription fixed automatically',
        `An attorney had more than one live subscription. Kept ${keeperId}.\n${lines.join('\n')}\n\nAdmin → Деньги → «Платежи и возвраты» → «Двойные подписки».`,
      )
      .catch(() => undefined);
  }

  /** Audit row of a system action. audit_log needs a user as actor; the
   * attorney concerned stands in (action prefix `system.`). */
  private async record(
    row: BillingDuplicateFix,
    step: string,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    try {
      await this.audit?.record({
        adminId: row.user_id,
        action: `system.billing.duplicate_subscription.${step}`,
        targetType: 'billing_duplicate_fix',
        targetId: row.id,
        after: { ...after, actor: 'system', status: row.status },
      });
    } catch (e) {
      this.logger.warn(`duplicate audit row failed: ${String(e)}`);
    }
  }

  // ---- per-attorney lock ----------------------------------------------------------

  private async lock(userId: string): Promise<string> {
    const key = `billing:dupsub:lock:${userId}`;
    const token = randomUUID();
    const until = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      const ok = await this.redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
      if (ok === 'OK') return token;
      if (Date.now() > until) {
        throw new Error(`duplicate-subscription lock busy for ${userId}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  private async unlock(userId: string, token: string): Promise<void> {
    const key = `billing:dupsub:lock:${userId}`;
    try {
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        token,
      );
    } catch {
      // The TTL frees it.
    }
  }
}

function baseCandidate(
  s: ProviderSubscription,
): DuplicateCandidate & { latestInvoiceId: string | null } {
  return {
    id: s.id,
    customerId: s.customerId,
    status: s.status,
    created: s.created ?? null,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    metadata: s.metadata ?? {},
    lastPaid: null,
    latestInvoiceId: s.latestInvoiceId ?? null,
  };
}
