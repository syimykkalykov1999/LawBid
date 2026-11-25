import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  JobStoppedError,
  throwIfJobStopped,
} from '../../common/queues/job-signal';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER } from '../../modules/billing/billing.constants';
import { refreshProvider } from '../../modules/billing/dynamic-payment.provider';
import type {
  PaymentProvider,
  ProviderRefund,
} from '../../modules/billing/payment-provider';
import { SubscriptionSyncService } from '../../modules/billing/subscription-sync.service';

export interface VerificationLossResult {
  attorneys: number;
  subscriptionsCanceled: number;
  refundedCents: number;
  promotionsCanceled: number;
}

/** Attorneys checked per set-based read of [VerificationLossBillingJob]. */
const LOSS_CHECK_BATCH = 1000;

/** Every loss refund starts its reason with this (see [handle]). */
const LOSS_REFUND_WHERE = {
  admin_id: null,
  stripe_refund_id: null,
  reason: { startsWith: 'Verification lost:' },
};

/** Stripe keeps an idempotency key at least 24 h: a retry inside this
 * window can never refund twice (stripe.com/docs/api/idempotent_requests). */
const REFUND_RETRY_WINDOW_MS = 23 * 3_600_000;

/** Unsent loss refunds retried per run. */
const LOSS_REFUND_RETRY_BATCH = 100;

/** Batch E (14.11): JSON [LossMark] — where the last run stopped reading. */
export const LOSS_MARK_KEY = 'billing:verification-loss:mark';

interface LossMark {
  /** Start of the last finished run (ms): the next reads rows changed since. */
  since: number;
  /** Start of the last full read of the list (ms). */
  fullAt: number;
  /** Attorneys whose handling failed: tried again even if unchanged. */
  retry: string[];
}

const LOST_STATUSES = ['rejected', 'suspended'] as const;

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
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
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
    // Pack C (round 2 #7): refunds a Stripe error left unsent go out first,
    // even with the switch off (the subscription / boost is already gone).
    out.refundedCents += await this.retryRefunds();
    if (!(await this.settings.boolean('billing.cancel_on_verification_loss'))) {
      return out;
    }
    // Batch E (14.11): the rejected / suspended list only grows, and every
    // 10 minutes it was read whole. Now: the attorneys whose profile row
    // changed since the last finished run (`updated_at` moves with every
    // status change; minus an overlap for transactions that committed
    // late), the ones that failed last time, and the whole list once per
    // `billing.verification_loss_full_scan_hours` as a safety net (0 = every
    // run). Without Redis, or with no mark yet: the whole list. Read in
    // pages either way.
    const startedAt = Date.now();
    const mark = await this.readMark();
    const fullEveryH = await this.settings.number(
      'billing.verification_loss_full_scan_hours',
    );
    const overlapMs =
      Math.max(
        0,
        await this.settings.number('billing.verification_loss_overlap_minutes'),
      ) * 60_000;
    const full =
      !mark ||
      !(fullEveryH > 0) ||
      startedAt - mark.fullAt >= fullEveryH * 3_600_000;
    const changedSince = full ? null : new Date(mark.since - overlapMs);
    const failed: string[] = [];
    const seen = new Set<string>();

    const work = async (ids: string[]) => {
      for (const userId of await this.withSomethingToStop(ids)) {
        throwIfJobStopped();
        try {
          const did = await this.handle(userId, out);
          if (did) out.attorneys += 1;
        } catch (err) {
          if (err instanceof JobStoppedError) throw err;
          failed.push(userId);
          this.logger.error(
            { err, userId },
            'verification-loss billing failed',
          );
        }
      }
    };

    // Keyset pages. The changed-rows read is ordered by (updated_at,
    // user_id): EXPLAIN of Prisma's generic plan on 300 000 rows (PG 16) —
    // ORDER BY user_id walked the primary key and filtered every row
    // (292 ms, 301 368 buffers), this order uses
    // attorney_profiles_verification_status_updated_at_idx (6 ms). The full
    // read keeps user_id order (primary key, 3 ms a page).
    let after: { id: string; at: Date } | null = null;
    for (;;) {
      const keyset = !after
        ? {}
        : changedSince
          ? {
              OR: [
                { updated_at: { gt: after.at } },
                { updated_at: after.at, user_id: { gt: after.id } },
              ],
            }
          : { user_id: { gt: after.id } };
      const page: { user_id: string; updated_at: Date }[] =
        await this.prisma.attorneyProfile.findMany({
          where: {
            verification_status: { in: [...LOST_STATUSES] },
            ...(changedSince ? { updated_at: { gte: changedSince } } : {}),
            ...keyset,
          },
          select: { user_id: true, updated_at: true },
          orderBy: changedSince
            ? [{ updated_at: 'asc' }, { user_id: 'asc' }]
            : { user_id: 'asc' },
          take: LOSS_CHECK_BATCH,
        });
      const ids = page.map((p) => p.user_id);
      ids.forEach((id) => seen.add(id));
      await work(ids);
      if (page.length < LOSS_CHECK_BATCH) break;
      const last = page[page.length - 1];
      after = { id: last.user_id, at: last.updated_at };
    }
    // Last run's failures, if still not verified (unchanged rows are not in
    // the changed-rows read above).
    const retry = (mark?.retry ?? []).filter((id) => !seen.has(id));
    if (retry.length > 0) {
      const still = await this.prisma.attorneyProfile.findMany({
        where: {
          user_id: { in: retry },
          verification_status: { in: [...LOST_STATUSES] },
        },
        select: { user_id: true },
      });
      await work(still.map((r) => r.user_id));
    }
    await this.writeMark({
      since: startedAt,
      fullAt: full ? startedAt : mark.fullAt,
      retry: failed.slice(0, LOSS_CHECK_BATCH),
    });
    if (out.attorneys > 0) {
      this.logger.info({ ...out, full }, 'verification-loss billing finished');
    }
    return out;
  }

  private async readMark(): Promise<LossMark | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(LOSS_MARK_KEY);
      if (!raw) return null;
      const m = JSON.parse(raw) as Partial<LossMark>;
      if (typeof m.since !== 'number' || typeof m.fullAt !== 'number') {
        return null;
      }
      return {
        since: m.since,
        fullAt: m.fullAt,
        retry: Array.isArray(m.retry)
          ? m.retry.filter((x): x is string => typeof x === 'string')
          : [],
      };
    } catch {
      // Redis away / bad value: read the whole list (the safe side).
      return null;
    }
  }

  /** Only after the whole pass: a crash midway re-reads from the old mark. */
  private async writeMark(mark: LossMark): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(LOSS_MARK_KEY, JSON.stringify(mark));
    } catch (err) {
      this.logger.warn({ err }, 'verification-loss mark not saved');
    }
  }

  /**
   * 13.11 (1B load test, owner list row 76 sweep): of [userIds], those
   * [handle] would change anything for — a live Stripe subscription, a
   * running / paused / pending boost, or unspent offer credits — read in
   * three set-based queries per [LOSS_CHECK_BATCH]. The stand's 20 000
   * suspended attorneys with none of these took 671 s per run (four reads
   * each) on the one-at-a-time `cron` lane, every 10 minutes. Same
   * conditions as [handle]; input order kept.
   */
  private async withSomethingToStop(userIds: string[]): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < userIds.length; i += LOSS_CHECK_BATCH) {
      const ids = userIds.slice(i, i + LOSS_CHECK_BATCH);
      const [subs, promos, credits] = await Promise.all([
        this.prisma.subscription.findMany({
          where: {
            user_id: { in: ids },
            stripe_subscription_id: { not: null },
            status: { in: ['active', 'trialing', 'past_due'] },
          },
          select: { user_id: true },
        }),
        this.prisma.casePromotion.findMany({
          where: {
            user_id: { in: ids },
            status: { in: ['active', 'paused', 'pending_review'] },
          },
          select: { user_id: true },
        }),
        this.prisma.bidCredit.findMany({
          where: { user_id: { in: ids }, balance: { gt: 0 } },
          select: { user_id: true },
        }),
      ]);
      const due = new Set(
        [...subs, ...promos, ...credits].map((r) => r.user_id),
      );
      for (const id of ids) if (due.has(id)) out.push(id);
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
        const payment = await this.lastRenewal(userId);
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
          // Algo audit 2026-10-27 (MONEY M-1): an offer spent meanwhile
          // (consume() raced this job) never pushes the balance below 0.
          const dec = await this.prisma.bidCredit.updateMany({
            where: { user_id: userId, balance: { gte: take } },
            data: { balance: { decrement: take } },
          });
          if (dec.count === 0) {
            await this.prisma.bidCredit.updateMany({
              where: { user_id: userId, balance: { gt: 0 } },
              data: { balance: 0 },
            });
          }
          did = true;
        }
      }
    }
    return did;
  }

  /**
   * Algo audit 2026-10-27 (MONEY M-1): the base of "the unused part of the
   * period" is the last paid RENEWAL invoice — not a small seat-purchase
   * proration invoice and not a $0 one (those used to shrink the refund).
   */
  private async lastRenewal(userId: string) {
    const candidates = await this.prisma.payment.findMany({
      where: {
        user_id: userId,
        status: 'succeeded',
        stripe_invoice_id: { not: null },
        amount_cents: { gt: 0 },
      },
      orderBy: { paid_at: 'desc' },
      take: 10,
    });
    if (!candidates.length) return null;
    const seats = await this.prisma.assistantSeatChange.findMany({
      where: {
        stripe_invoice_id: { in: candidates.map((c) => c.stripe_invoice_id!) },
      },
      select: { stripe_invoice_id: true },
    });
    const seatInvoices = new Set(seats.map((x) => x.stripe_invoice_id));
    return (
      candidates.find((c) => !seatInvoices.has(c.stripe_invoice_id)) ?? null
    );
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
    const sent = await this.send(row.id, intent, amount, payment.id);
    return sent === 'failed' ? 0 : amount;
  }

  /**
   * One provider call for a reserved refund row, always with the row's own
   * key: Stripe answers a repeated key with the first result (keys live at
   * least 24 h), so a retry never refunds twice. A provider error leaves the
   * row `pending` — the money stays reserved and [retryRefunds] sends it
   * again — instead of the old `failed` + `return 0`, after which no run
   * looked at it again (round 2 #7). `retry`: not sent yet, still
   * reserved; `failed`: Stripe itself marked the refund failed.
   */
  private async send(
    refundId: string,
    intent: string,
    amount: number,
    paymentId: string,
    retrying = false,
  ): Promise<'sent' | 'retry' | 'failed'> {
    let r: ProviderRefund;
    try {
      r = await this.provider.refund!({
        paymentIntentId: intent,
        amountCents: amount,
        idempotencyKey: `refund:${refundId}`,
        metadata: { refundId, paymentId, system: 'loss' },
      });
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(
        0,
        500,
      );
      await this.prisma.refund.update({
        where: { id: refundId },
        data: { status: 'pending', failure_reason: message },
      });
      // One error line per refund; the retries after it are warnings.
      this.logger[retrying ? 'warn' : 'error'](
        { err: e, refundId, paymentId },
        'verification-loss refund not sent; retried on the next run',
      );
      return 'retry';
    }
    await this.prisma.refund.update({
      where: { id: refundId },
      data: {
        status: r.status,
        stripe_refund_id: r.id,
        failure_reason: r.failureReason,
      },
    });
    if (r.status === 'failed') {
      this.logger.error(
        { refundId, paymentId, reason: r.failureReason },
        'verification-loss refund failed at the provider',
      );
      return 'failed';
    }
    return 'sent';
  }

  /**
   * Pack C (round 2 #7): the loss refunds a provider error left unsent —
   * `pending` (or `failed` by the old code) and no Stripe id — are sent
   * again with the same key and amount while Stripe still knows the key
   * ([REFUND_RETRY_WINDOW_MS]); past it a person must look (error log,
   * the row turns `failed` and frees the reservation). Returns the cents
   * that went back.
   */
  private async retryRefunds(): Promise<number> {
    if (typeof this.provider.refund !== 'function') return 0;
    const since = new Date(Date.now() - REFUND_RETRY_WINDOW_MS);
    let back = 0;
    try {
      const stale = await this.prisma.refund.updateMany({
        where: {
          ...LOSS_REFUND_WHERE,
          status: 'pending',
          created_at: { lt: since },
        },
        data: { status: 'failed' },
      });
      if (stale.count > 0) {
        this.logger.error(
          { count: stale.count },
          'verification-loss refunds unsent past the retry window: Admin → Платежи → Возвраты',
        );
      }
      const rows = await this.prisma.refund.findMany({
        where: {
          ...LOSS_REFUND_WHERE,
          status: { in: ['pending', 'failed'] },
          created_at: { gte: since },
        },
        orderBy: { created_at: 'asc' },
        take: LOSS_REFUND_RETRY_BATCH,
      });
      if (rows.length > 0) await refreshProvider(this.provider);
      for (const row of rows) {
        throwIfJobStopped();
        const payment = await this.prisma.payment.findUnique({
          where: { id: row.payment_id },
        });
        const intent =
          payment?.stripe_payment_intent_id ??
          (payment && this.provider.name === 'fake'
            ? `pi_fake_${payment.id}`
            : null);
        if (!payment || !intent) continue;
        if (row.status === 'failed') {
          // The old code freed this amount: take it back only if the
          // payment still has room for it.
          const live = await this.prisma.refund.aggregate({
            where: {
              payment_id: payment.id,
              id: { not: row.id },
              status: { in: ['pending', 'succeeded'] },
            },
            _sum: { amount_cents: true },
          });
          const room = payment.amount_cents - (live._sum.amount_cents ?? 0);
          if (row.amount_cents > room) continue;
        }
        const sent = await this.send(
          row.id,
          intent,
          row.amount_cents,
          payment.id,
          true,
        );
        if (sent === 'sent') back += row.amount_cents;
      }
    } catch (err) {
      if (err instanceof JobStoppedError) throw err;
      this.logger.error({ err }, 'verification-loss refund retry failed');
    }
    return back;
  }
}
