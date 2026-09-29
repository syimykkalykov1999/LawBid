import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Payment, Subscription } from '@prisma/client';
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
  SUBSCRIPTION_PRICE_CENTS,
  TRIAL_DAYS,
  TRIAL_REMINDER_DAYS_BEFORE,
  TRIAL_REMINDER_JOB,
} from './billing.constants';
import type {
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
@Injectable()
export class SubscriptionsService {
  private readonly priceId: string | undefined;
  private readonly portalReturnUrl: string;
  private queue?: Queue;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly access: SubscriptionAccessService,
    private readonly sync: SubscriptionSyncService,
    config: ConfigService,
  ) {
    this.priceId =
      config.get<string>('STRIPE_PRICE_ID') ??
      (this.provider.name === 'fake' ? 'price_fake_399' : undefined);
    this.portalReturnUrl =
      config.get<string>('STRIPE_PORTAL_RETURN_URL') ??
      `${config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'}/subscription`;
    const url = config.get<string>('REDIS_URL');
    if (url)
      this.queue = new Queue(SUBSCRIPTION_JOBS_QUEUE, { connection: { url } });
  }

  async start(user: RequestUser): Promise<StartSubscriptionResultDto> {
    const attorney = await this.verifiedAttorney(user);
    this.assertConfigured();
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
      priceCents: SUBSCRIPTION_PRICE_CENTS,
      trialDays: TRIAL_DAYS,
    };
  }

  async confirm(
    user: RequestUser,
    setupIntentId: string,
    chargeNow: boolean,
  ): Promise<SubscriptionMeDto> {
    await this.verifiedAttorney(user);
    const priceId = this.assertConfigured();
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
    if (!eligible && !chargeNow) {
      // §1.1: the app shows "Пробный период недоступен, будет списано $399
      // сейчас" and repeats with chargeNow after an explicit confirmation.
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_TRIAL_UNAVAILABLE,
        message:
          'No trial is available for this account or card; $399 will be charged now.',
        details: { chargeNowCents: SUBSCRIPTION_PRICE_CENTS },
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
        price_cents: SUBSCRIPTION_PRICE_CENTS,
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
    const [row, profile] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { user_id: user.sub } }),
      this.prisma.attorneyProfile.findUnique({
        where: { user_id: user.sub },
        select: { verification_status: true },
      }),
    ]);
    const isActive = SubscriptionAccessService.rowIsActive(row);
    return {
      subscription: row ? presentSubscription(row) : null,
      isActive,
      canStart: profile?.verification_status === 'verified' && !isActive,
      trialEligible: await this.attorneyTrialEligible(user.sub),
      priceCents: SUBSCRIPTION_PRICE_CENTS,
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
    this.assertConfigured();
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

  private assertConfigured(): string {
    if (!this.priceId) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    return this.priceId;
  }
}

export function presentSubscription(s: Subscription): SubscriptionDto {
  return {
    id: s.id,
    status: s.status,
    isActive: SubscriptionAccessService.rowIsActive(s),
    priceCents: s.price_cents,
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
