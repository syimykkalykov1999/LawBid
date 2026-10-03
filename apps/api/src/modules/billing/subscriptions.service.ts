import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Payment, PromoCode, Subscription } from '@prisma/client';
import { Queue } from 'bullmq';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  PAYMENT_PROVIDER,
  SUBSCRIPTION_CURRENCY,
  SUBSCRIPTION_JOBS_QUEUE,
  TRIAL_DAYS,
  TRIAL_REMINDER_DAYS_BEFORE,
  TRIAL_REMINDER_JOB,
  MAX_ASSISTANT_SEATS,
} from './billing.constants';
import { type PlanAmounts, PricingService } from './pricing.service';
import { DEFAULT_DUTIES } from '../assistants/assistant-duties';
import {
  checkPromo,
  ensurePromoCoupon,
  promoDiscountCents,
  type PromoDiscountType,
  recordPromoRedemption,
} from '../admin-billing/promo-rules';
import type {
  CheckoutRequestDto,
  CheckoutSessionDto,
  PaymentDto,
  PaymentsPage,
  StartSubscriptionResultDto,
  SubscriptionDto,
  SubscriptionMeDto,
} from './billing.dto';
import type { PaymentProvider } from './payment-provider';
import { SubscriptionSyncService } from './subscription-sync.service';

const PAYMENTS_PAGE = 20;

/**
 * docs/06 §1.4 flows: start (customer + SetupIntent), confirm (card →
 * subscription with a 7-day trial when eligible, one trial per attorney
 * and per card fingerprint), me, payments, portal, cancel. Everything
 * after creation is driven by webhooks (SubscriptionSyncService).
 */
import { ReferralsService } from '../referrals/referrals.service';
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  private readonly portalReturnUrl: string;
  /** Where Stripe Checkout returns (the website's pages / app links). */
  private readonly checkoutReturnBase: string;
  private queue?: Queue;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly access: SubscriptionAccessService,
    private readonly sync: SubscriptionSyncService,
    config: ConfigService,
    private readonly pricing: PricingService,
    @Optional() private readonly referrals?: ReferralsService,
  ) {
    this.portalReturnUrl =
      config.get<string>('STRIPE_PORTAL_RETURN_URL') ??
      `${config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'}/subscription`;
    this.checkoutReturnBase =
      config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app';
    const url = config.get<string>('REDIS_URL');
    if (url)
      this.queue = new Queue(SUBSCRIPTION_JOBS_QUEUE, { connection: { url } });
  }

  async start(user: RequestUser): Promise<StartSubscriptionResultDto> {
    const attorney = await this.verifiedAttorney(user);
    await this.assertConfigured();
    const existing = await this.prisma.subscription.findUnique({
      where: { user_id: user.sub },
    });
    if (existing && SubscriptionAccessService.rowIsActive(existing)) {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE,
        message: 'A subscription is already active.',
      });
    }
    const customerId = await this.customerId(user.sub, attorney.email);
    const si = await this.provider.createSetupIntent(customerId);
    return {
      clientSecret: si.clientSecret,
      setupIntentId: si.id,
      customerId,
      trialEligible: await this.attorneyTrialEligible(user.sub),
      priceCents: await this.pricing.amount('monthly'),
      trialDays: TRIAL_DAYS,
    };
  }

  /**
   * POST /subscriptions/checkout (owner 2026-09-30): the subscription is
   * paid on Stripe's hosted page in the browser — no card form in the app
   * (store rules), Stripe's fee only. A 7-day trial when the attorney had
   * none; the card rule is applied when the checkout completes.
   */
  async checkout(
    user: RequestUser,
    req: CheckoutRequestDto = {},
  ): Promise<CheckoutSessionDto> {
    const attorney = await this.verifiedAttorney(user);
    const priceId = await this.assertConfigured();
    const plan = req.plan ?? 'monthly';
    const seats =
      plan === 'yearly' ? MAX_ASSISTANT_SEATS : (req.assistantSeats ?? 0);
    const phones = [...new Set(req.assistantPhones ?? [])];
    if (phones.length > seats) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'More assistant phones than seats.',
        details: { field: 'assistantPhones', max: seats },
      });
    }
    const lineItems =
      plan === 'yearly'
        ? [{ priceId: await this.requirePrice('yearly'), quantity: 1 }]
        : [
            { priceId, quantity: 1 },
            ...(seats > 0
              ? [{ priceId: await this.requirePrice('seat'), quantity: seats }]
              : []),
          ];
    const existing = await this.prisma.subscription.findUnique({
      where: { user_id: user.sub },
    });
    if (existing && SubscriptionAccessService.rowIsActive(existing)) {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE,
        message: 'A subscription is already active.',
      });
    }
    const customerId = await this.customerId(user.sub, attorney.email);
    const amounts = await this.pricing.amounts();
    // A row keyed to the customer, so the provider's webhooks find it.
    if (!existing) {
      await this.prisma.subscription.create({
        data: {
          user_id: user.sub,
          status: 'incomplete',
          price_cents: amounts.monthly,
        },
      });
    }
    const eligible = await this.attorneyTrialEligible(user.sub);
    const priceCents = planCents(amounts, plan, seats);
    // Owner 2026-10-02: an optional promo code — a coupon on the session,
    // or free days added to the trial. Redeemed when the checkout is paid.
    const promo = req.promoCode
      ? await this.checkoutPromo(user, req.promoCode, plan)
      : null;
    const couponId = promo
      ? await ensurePromoCoupon(
          this.prisma,
          this.provider,
          promo,
          SUBSCRIPTION_CURRENCY,
        )
      : await this.referralCoupon(user.sub);
    const promoDays =
      promo?.discount_type === 'free_days' ? (promo.free_days ?? 0) : 0;
    const trialDays = (eligible ? TRIAL_DAYS : 0) + promoDays;
    const base = this.checkoutReturnBase;
    const session = await this.provider.createCheckoutSession({
      customerId,
      lineItems,
      trialDays: trialDays > 0 ? trialDays : null,
      successUrl: `${base}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/subscription/cancel`,
      metadata: {
        userId: user.sub,
        plan,
        seats: String(seats),
        // Owner 2026-10-03: the amount the attorney saw, so the row keeps
        // it even if the admin changes the price before the webhook.
        priceCents: String(priceCents),
        phones: phones.join(','),
        ...(promo
          ? {
              promoId: promo.id,
              promoFreeDays: String(promoDays),
              promoOffCents: String(
                promoDiscountCents(promo, priceCents) ?? '',
              ),
            }
          : {}),
      },
      ...(couponId ? { couponId } : {}),
    });
    return {
      url: session.url ?? '',
      sessionId: session.id,
      trialEligible: eligible,
      priceCents,
      trialDays: TRIAL_DAYS,
      ...(promo
        ? {
            promo: {
              code: promo.code,
              discountType: promo.discount_type as PromoDiscountType,
              discountCents: promoDiscountCents(promo, priceCents),
              freeDays: promoDays || null,
            },
          }
        : {}),
    };
  }

  /**
   * POST /subscriptions/checkout/complete — the app, back from the
   * browser, (and the `checkout.session.completed` webhook) apply the
   * paid session: the subscription row, §1.1 one trial per card (a card
   * that already had a trial is charged at once), the trial reminder.
   * Idempotent; an unpaid session leaves everything as it was.
   */
  async completeCheckout(
    user: RequestUser,
    sessionId: string,
  ): Promise<SubscriptionMeDto> {
    await this.verifiedAttorney(user);
    await this.applyCheckout(sessionId, user.sub);
    return this.me(user);
  }

  /** Shared by the app call and the webhook; [userId] when known. */
  async applyCheckout(sessionId: string, userId?: string): Promise<void> {
    const session = await this.provider.retrieveCheckoutSession(sessionId);
    const owner = userId ?? session?.metadata.userId;
    if (
      !session ||
      !owner ||
      session.metadata.userId !== owner ||
      session.status !== 'complete' ||
      !session.subscriptionId
    ) {
      return;
    }
    let remote = await this.provider.retrieveSubscription(
      session.subscriptionId,
    );
    if (!remote) return;
    // Audit 2026-10-01: a second paid checkout (two devices, an old tab)
    // while a live subscription exists must not replace it — the first
    // would keep billing unseen. The newcomer is cancelled at once.
    const current = await this.prisma.subscription.findUnique({
      where: { user_id: owner },
    });
    if (
      current?.stripe_subscription_id &&
      current.stripe_subscription_id !== remote.id &&
      SubscriptionAccessService.rowIsActive(current)
    ) {
      if (remote.status !== 'canceled') {
        await this.provider.cancelNow(remote.id);
        this.logger.error(
          `duplicate subscription ${remote.id} for ${owner} cancelled (kept ${current.stripe_subscription_id}); refund its first invoice if paid`,
        );
      }
      return;
    }
    const fingerprint = remote.defaultPaymentMethodId
      ? await this.provider.paymentMethodFingerprint(
          remote.defaultPaymentMethodId,
        )
      : null;
    const promoDays = Number(session.metadata.promoFreeDays ?? 0) || 0;
    if (
      remote.status === 'trialing' &&
      !(await this.cardTrialEligible(fingerprint, owner))
    ) {
      // §1.1: this card already had a trial elsewhere — charge now
      // (owner 2026-10-02: a promo's free days are still given).
      remote =
        promoDays > 0
          ? await this.provider.extendUntil(
              remote.id,
              Math.floor(Date.now() / 1000) + promoDays * 86_400,
            )
          : await this.provider.endTrialNow(remote.id);
    }
    const existing = await this.prisma.subscription.findUnique({
      where: { user_id: owner },
    });
    const trialing = remote.status === 'trialing';
    const plan = session.metadata.plan === 'yearly' ? 'yearly' : 'monthly';
    const seats = Math.min(
      MAX_ASSISTANT_SEATS,
      Math.max(0, Number(session.metadata.seats ?? 0) || 0),
    );
    const quoted = Number(session.metadata.priceCents);
    const priceCents =
      Number.isFinite(quoted) && quoted > 0
        ? quoted
        : planCents(await this.pricing.amounts(), plan, seats);
    await this.prisma.subscription.upsert({
      where: { user_id: owner },
      create: {
        user_id: owner,
        stripe_subscription_id: remote.id,
        status: 'incomplete',
        price_cents: priceCents,
        plan,
        assistant_seats: seats,
        trial_started_at: trialing ? new Date() : null,
        card_fingerprint: fingerprint,
      },
      update: {
        price_cents: priceCents,
        plan,
        assistant_seats: seats,
        stripe_subscription_id: remote.id,
        trial_started_at: trialing
          ? (existing?.trial_started_at ?? new Date())
          : (existing?.trial_started_at ?? null),
        card_fingerprint: fingerprint,
        cancel_at_period_end: false,
        canceled_at: null,
      },
    });
    const row = await this.sync.apply(remote);
    if (row?.status === 'trialing' && row.trial_ends_at) {
      await this.scheduleTrialReminder(row);
    }
    // OQ-048: assistants added at purchase join without the attorney's OTP.
    const phones = (session.metadata.phones ?? '')
      .split(',')
      .filter((p) => /^\+[1-9][0-9]{7,14}$/.test(p))
      .slice(0, seats);
    for (const phone of phones) {
      // Audit 2026-10-01: the webhook and the app's call run at once —
      // check + create in one serializable transaction (no duplicates).
      await withTxRetry(this.prisma, async (tx) => {
        const live = await tx.assistantMembership.findFirst({
          where: { phone_e164: phone, status: { not: 'removed' } },
          select: { id: true },
        });
        if (live) return;
        await tx.assistantMembership.create({
          data: {
            attorney_id: owner,
            phone_e164: phone,
            approval: 'purchase',
            status: 'invited',
            duties: [...DEFAULT_DUTIES],
          },
        });
      });
    }
    // Owner 2026-10-02: the promo code is used once the checkout is paid
    // (an abandoned page does not burn it). Idempotent per user.
    if (session.metadata.promoId) {
      const off = Number(session.metadata.promoOffCents);
      await recordPromoRedemption(this.prisma, {
        promoId: session.metadata.promoId,
        userId: owner,
        amountOffCents: Number.isFinite(off) && off > 0 ? off : null,
      });
    }
    await this.access.invalidate(owner);
  }

  /**
   * Owner 2026-10-02: a referred attorney's first-invoice discount, as a
   * one-use coupon. Only when no promo code was given (Stripe takes one
   * discount per session). Never blocks the checkout.
   */
  private async referralCoupon(userId: string): Promise<string | null> {
    if (!this.referrals || !this.provider.createCoupon) return null;
    try {
      const percent =
        await this.referrals.pendingReferralDiscountPercent(userId);
      if (percent <= 0) return null;
      const coupon = await this.provider.createCoupon({
        code: `REF${userId.replace(/-/g, '').slice(0, 10).toUpperCase()}${Date.now().toString(36).toUpperCase()}`,
        percentOff: percent,
        amountOffCents: null,
        currency: SUBSCRIPTION_CURRENCY,
        maxRedemptions: 1,
        redeemBy: Math.floor(Date.now() / 1000) + 24 * 3600,
        metadata: { kind: 'referral_discount', userId },
      });
      return coupon.couponId;
    } catch (e) {
      this.logger.warn(`referral coupon skipped: ${String(e)}`);
      return null;
    }
  }

  /** Owner 2026-10-02: a promo code given at checkout, or 400. */
  private async checkoutPromo(
    user: RequestUser,
    code: string,
    plan: 'monthly' | 'yearly',
  ): Promise<PromoCode> {
    const check = await checkPromo(this.prisma, {
      code,
      userId: user.sub,
      role: user.role,
      purchase: plan,
    });
    if (!check.valid) {
      throw new BadRequestException({
        code: ErrorCode.PROMO_CODE_INVALID,
        message: 'This promo code cannot be used.',
        details: { field: 'promoCode', reason: check.reason },
      });
    }
    return check.promo;
  }

  /** OQ-048: monthly plan — change the number of assistant seats. */
  /** Owner 2026-10-01: monthly → yearly "Prime" (attorney + 6 assistants);
   * Stripe invoices the difference now. */
  async switchToYearly(user: RequestUser): Promise<SubscriptionMeDto> {
    await this.verifiedAttorney(user);
    const row = await this.prisma.subscription.findUnique({
      where: { user_id: user.sub },
    });
    if (
      !row ||
      !SubscriptionAccessService.rowIsActive(row) ||
      !row.stripe_subscription_id
    ) {
      throw new NotFoundException({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'No active subscription.',
      });
    }
    if (row.plan === 'yearly') {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_PLAN_INCLUDES_SEATS,
        message: 'Already on the yearly plan.',
      });
    }
    await this.provider.switchToYearly(
      row.stripe_subscription_id,
      await this.requirePrice('yearly'),
    );
    await this.prisma.subscription.update({
      where: { id: row.id },
      data: {
        plan: 'yearly',
        assistant_seats: MAX_ASSISTANT_SEATS,
        price_cents: await this.pricing.amount('yearly'),
      },
    });
    await this.access.invalidate(user.sub);
    return this.me(user);
  }

  async setSeats(user: RequestUser, seats: number): Promise<SubscriptionMeDto> {
    await this.verifiedAttorney(user);
    const row = await this.prisma.subscription.findUnique({
      where: { user_id: user.sub },
    });
    if (
      !row ||
      !SubscriptionAccessService.rowIsActive(row) ||
      !row.stripe_subscription_id
    ) {
      throw new NotFoundException({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'No active subscription.',
      });
    }
    if (row.plan === 'yearly') {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_PLAN_INCLUDES_SEATS,
        message: 'The yearly plan already includes 6 assistants.',
      });
    }
    const live = await this.prisma.assistantMembership.count({
      where: { attorney_id: user.sub, status: { not: 'removed' } },
    });
    if (seats < live) {
      throw new ConflictException({
        code: ErrorCode.ASSISTANT_SEATS_IN_USE,
        message: 'Remove assistants before lowering the number of seats.',
        details: { inUse: live },
      });
    }
    await this.provider.setSeatQuantity(
      row.stripe_subscription_id,
      await this.requirePrice('seat'),
      seats,
      await this.pricing.knownPriceIds('seat'),
    );
    // Owner 2026-10-03: seats added or removed at today's seat price; the
    // attorney's own plan amount stays what they bought.
    const seatCents = await this.pricing.amount('seat');
    const base = Math.max(0, row.price_cents - row.assistant_seats * seatCents);
    await this.prisma.subscription.update({
      where: { id: row.id },
      data: {
        assistant_seats: seats,
        price_cents: base + seats * seatCents,
      },
    });
    return this.me(user);
  }

  async confirm(
    user: RequestUser,
    setupIntentId: string,
    chargeNow: boolean,
  ): Promise<SubscriptionMeDto> {
    await this.verifiedAttorney(user);
    const priceId = await this.assertConfigured();
    const customerId = await this.customerId(user.sub, null);
    const si = await this.provider.retrieveSetupIntent(setupIntentId);
    if (
      !si ||
      si.customerId !== customerId ||
      si.status !== 'succeeded' ||
      !si.paymentMethodId
    ) {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_SETUP_INCOMPLETE,
        message: 'The card has not been confirmed yet.',
      });
    }
    const existing = await this.prisma.subscription.findUnique({
      where: { user_id: user.sub },
    });
    if (existing && SubscriptionAccessService.rowIsActive(existing)) {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE,
        message: 'A subscription is already active.',
      });
    }
    const fingerprint = await this.provider.paymentMethodFingerprint(
      si.paymentMethodId,
    );
    const eligible =
      (await this.attorneyTrialEligible(user.sub)) &&
      (await this.cardTrialEligible(fingerprint, user.sub));
    const monthlyCents = await this.pricing.amount('monthly');
    if (!eligible && !chargeNow) {
      // §1.1: the app shows "Пробный период недоступен, будет списано $399
      // сейчас" and repeats with chargeNow after an explicit confirmation.
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_TRIAL_UNAVAILABLE,
        message:
          'No trial is available for this account or card; the price will be charged now.',
        details: { chargeNowCents: monthlyCents },
      });
    }
    const remote = await this.provider.createSubscription({
      customerId,
      priceId,
      paymentMethodId: si.paymentMethodId,
      trialDays: eligible ? TRIAL_DAYS : null,
      metadata: { userId: user.sub },
    });
    const now = new Date();
    await withTxRetry(this.prisma, async (tx) => {
      const data = {
        stripe_subscription_id: remote.id,
        status: 'incomplete' as const,
        price_cents: monthlyCents,
        // The trial mark survives a re-subscription: it is what makes the
        // attorney ineligible for a second trial (§1.1).
        trial_started_at: eligible ? now : (existing?.trial_started_at ?? null),
        trial_ends_at: remote.trialEnd
          ? new Date(remote.trialEnd * 1000)
          : null,
        current_period_start: remote.currentPeriodStart
          ? new Date(remote.currentPeriodStart * 1000)
          : null,
        current_period_end: remote.currentPeriodEnd
          ? new Date(remote.currentPeriodEnd * 1000)
          : null,
        cancel_at_period_end: false,
        canceled_at: null,
        grace_ends_at: null,
        card_fingerprint: fingerprint,
      };
      await tx.subscription.upsert({
        where: { user_id: user.sub },
        create: { user_id: user.sub, ...data },
        update: data,
      });
    });
    // The final state comes from the provider (webhooks); apply what it
    // returned right away so the app sees trialing/active without waiting.
    const row = await this.sync.apply(remote);
    if (row?.status === 'trialing' && row.trial_ends_at)
      await this.scheduleTrialReminder(row);
    await this.access.invalidate(user.sub);
    return this.me(user);
  }

  async me(user: RequestUser): Promise<SubscriptionMeDto> {
    const [row, profile, grant] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { user_id: user.sub } }),
      this.prisma.attorneyProfile.findUnique({
        where: { user_id: user.sub },
        select: { verification_status: true },
      }),
      this.access.activeGrant(user.sub),
    ]);
    // Owner 2026-10-02: a free subscription under a contract counts.
    const isActive = SubscriptionAccessService.rowIsActive(row) || !!grant;
    const amounts = await this.pricing.amounts();
    return {
      subscription: row ? presentSubscription(row) : null,
      contractGrant: grant
        ? {
            endsAt: grant.ends_at.toISOString(),
            assistantSeats: grant.assistant_seats,
          }
        : null,
      isActive,
      canStart: profile?.verification_status === 'verified' && !isActive,
      trialEligible: await this.attorneyTrialEligible(user.sub),
      priceCents: amounts.monthly,
      prices: {
        monthlyCents: amounts.monthly,
        seatCents: amounts.seat,
        yearlyCents: amounts.yearly,
        maxSeats: MAX_ASSISTANT_SEATS,
      },
    };
  }

  async payments(user: RequestUser, cursor?: string): Promise<PaymentsPage> {
    const c = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.payment.findMany({
      where: {
        user_id: user.sub,
        ...(c
          ? {
              OR: [
                { created_at: { lt: c.createdAt } },
                { created_at: c.createdAt, id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAYMENTS_PAGE + 1,
    });
    const page = rows.slice(0, PAYMENTS_PAGE);
    const last = page[page.length - 1];
    return {
      items: page.map(presentPayment),
      nextCursor:
        rows.length > PAYMENTS_PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async portalSession(user: RequestUser): Promise<{ url: string }> {
    await this.verifiedAttorney(user);
    await this.assertConfigured();
    const customerId = await this.customerId(user.sub, null);
    return {
      url: await this.provider.createPortalSession(
        customerId,
        this.portalReturnUrl,
      ),
    };
  }

  /** §1.3 "Отмена пользователем: cancel_at_period_end = true". */
  async cancel(user: RequestUser): Promise<SubscriptionMeDto> {
    const row = await this.prisma.subscription.findUnique({
      where: { user_id: user.sub },
    });
    if (
      !row?.stripe_subscription_id ||
      !SubscriptionAccessService.rowIsActive(row)
    ) {
      throw new NotFoundException({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'No active subscription.',
      });
    }
    const remote = await this.provider.setCancelAtPeriodEnd(
      row.stripe_subscription_id,
      true,
    );
    await this.sync.apply(remote);
    return this.me(user);
  }

  /** Audit 2026-10-01: undo a cancel before the period ends (it used to
   * be possible only in the Stripe portal). */
  async resume(user: RequestUser): Promise<SubscriptionMeDto> {
    const row = await this.prisma.subscription.findUnique({
      where: { user_id: user.sub },
    });
    if (
      !row?.stripe_subscription_id ||
      !SubscriptionAccessService.rowIsActive(row)
    ) {
      throw new NotFoundException({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'No active subscription.',
      });
    }
    if (row.cancel_at_period_end) {
      const remote = await this.provider.setCancelAtPeriodEnd(
        row.stripe_subscription_id,
        false,
      );
      await this.sync.apply(remote);
    }
    return this.me(user);
  }

  /** §1.5: BullMQ job at trial_ends_at − 2 days (skipped when canceled). */
  async scheduleTrialReminder(
    row: Pick<Subscription, 'id' | 'trial_ends_at'>,
  ): Promise<void> {
    if (!this.queue || !row.trial_ends_at) return;
    const at =
      row.trial_ends_at.getTime() - TRIAL_REMINDER_DAYS_BEFORE * 86_400_000;
    const delay = at - Date.now();
    if (delay <= 0) return;
    await this.queue.add(
      TRIAL_REMINDER_JOB,
      { subscriptionId: row.id },
      {
        jobId: `trial-${row.id}-${row.trial_ends_at.getTime()}`,
        delay,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  // ------------------------------------------------------------------

  async customerId(userId: string, email: string | null): Promise<string> {
    const existing = await this.prisma.stripeCustomer.findUnique({
      where: { user_id: userId },
    });
    if (existing) return existing.stripe_customer_id;
    const id = await this.provider.createCustomer({ userId, email });
    const row = await this.prisma.stripeCustomer.upsert({
      where: { user_id: userId },
      create: { user_id: userId, stripe_customer_id: id },
      update: {},
    });
    return row.stripe_customer_id;
  }

  /** §1.1: "только один раз на адвоката". */
  private async attorneyTrialEligible(userId: string): Promise<boolean> {
    const used = await this.prisma.subscription.findFirst({
      where: { user_id: userId, trial_started_at: { not: null } },
      select: { id: true },
    });
    return !used;
  }

  /** §1.1: "один раз на карту (card_fingerprint)". */
  private async cardTrialEligible(
    fingerprint: string | null,
    userId: string,
  ): Promise<boolean> {
    if (!fingerprint) return true;
    const used = await this.prisma.subscription.findFirst({
      where: {
        card_fingerprint: fingerprint,
        trial_started_at: { not: null },
        user_id: { not: userId },
      },
      select: { id: true },
    });
    return !used;
  }

  private async verifiedAttorney(
    user: RequestUser,
  ): Promise<{ email: string | null }> {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Attorneys only.',
      });
    }
    const u = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        email: true,
        attorney_profile: { select: { verification_status: true } },
      },
    });
    if (u?.attorney_profile?.verification_status !== 'verified') {
      throw new ForbiddenException({
        code: ErrorCode.ATTORNEY_NOT_VERIFIED,
        message: 'The trial is available after verification.',
      });
    }
    return { email: u.email };
  }

  /** Seat / yearly price id (Billing → Prices in the admin, else the key
   * store / env, else fake ids), or 503 when a live Stripe has none. */
  private async requirePrice(kind: 'seat' | 'yearly'): Promise<string> {
    const priceId = await this.pricing.priceId(kind);
    if (!priceId) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message:
          kind === 'seat'
            ? 'Stripe price for assistant seats is not set.'
            : 'Stripe price for the yearly plan is not set.',
        details: { price: kind },
      });
    }
    return priceId;
  }

  private async assertConfigured(): Promise<string> {
    const priceId = await this.pricing.priceId('monthly');
    if (!priceId) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    return priceId;
  }
}

/** What a plan costs per period at [amounts]. */
export function planCents(
  amounts: PlanAmounts,
  plan: 'monthly' | 'yearly',
  seats: number,
): number {
  return plan === 'yearly'
    ? amounts.yearly
    : amounts.monthly + seats * amounts.seat;
}

export function presentSubscription(s: Subscription): SubscriptionDto {
  return {
    id: s.id,
    status: s.status,
    isActive: SubscriptionAccessService.rowIsActive(s),
    priceCents: s.price_cents,
    plan: s.plan,
    assistantSeats: s.assistant_seats,
    trialEndsAt: s.trial_ends_at?.toISOString() ?? null,
    currentPeriodEnd: s.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    canceledAt: s.canceled_at?.toISOString() ?? null,
    graceEndsAt: s.grace_ends_at?.toISOString() ?? null,
    createdAt: s.created_at.toISOString(),
  };
}

export function presentPayment(p: Payment): PaymentDto {
  return {
    id: p.id,
    amountCents: p.amount_cents,
    currency: p.currency || SUBSCRIPTION_CURRENCY,
    status: p.status,
    paidAt: p.paid_at?.toISOString() ?? null,
    failureCode: p.failure_code,
    createdAt: p.created_at.toISOString(),
  };
}
