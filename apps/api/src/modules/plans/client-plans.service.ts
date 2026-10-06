import {
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
import type { ClientSubscription, Plan } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type {
  PaymentProvider,
  ProviderCheckoutSession,
  ProviderSubscription,
} from '../billing/payment-provider';
import { PricingService } from '../billing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  ClientPlanCheckoutDto,
  ClientPlanMeDto,
  ClientSubscriptionDto,
} from './client-plans.dto';
import { entitlementNumber } from './entitlement-catalog';
import {
  clientSubscriptionActive,
  EntitlementsService,
} from './entitlements.service';
import { presentPlan } from './plans.controller';
import { PlansService } from './plans.service';

export const CLIENT_PLAN_CHECKOUT_KIND = 'client_plan';

/**
 * Owner 2026-10-05 (plan builder): a client buys a plan (badge, cases first
 * in the feed, …) on Stripe's hosted page, exactly like an attorney's
 * subscription; the row is then driven by webhooks. The entitlements are
 * frozen on the row at purchase.
 */
@Injectable()
export class ClientPlansService {
  private readonly logger = new Logger(ClientPlansService.name);
  private readonly returnBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
    private readonly pricing: PricingService,
    config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    this.returnBase = (
      config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'
    ).replace(/\/+$/, '');
  }

  async me(user: RequestUser): Promise<ClientPlanMeDto> {
    this.requireClient(user);
    const [row, plans, resolved] = await Promise.all([
      this.prisma.clientSubscription.findUnique({
        where: { user_id: user.sub },
      }),
      this.plans.purchasable('client'),
      this.entitlements.forUser(user.sub),
    ]);
    const plan = row?.plan_id ? await this.safePlan(row.plan_id) : null;
    return {
      subscription: row ? presentClientSubscription(row, plan) : null,
      isActive: clientSubscriptionActive(row),
      plan: plan ? await presentPlan(plan, this.plans, this.pricing) : null,
      entitlements: resolved.values,
      plans: await Promise.all(
        plans.map((p) => presentPlan(p, this.plans, this.pricing)),
      ),
      trialEligible: !row?.trial_ends_at,
    };
  }

  async checkout(
    user: RequestUser,
    planCode?: string,
  ): Promise<ClientPlanCheckoutDto> {
    this.requireClient(user);
    const plan = planCode
      ? await this.plans.byCode(planCode)
      : await this.plans.defaultFor('client', 'month');
    if (
      !plan ||
      plan.audience !== 'client' ||
      plan.kind !== 'paid' ||
      plan.status !== 'active' ||
      !plan.price_kind
    ) {
      throw new ConflictException({
        code: ErrorCode.PLAN_NOT_AVAILABLE,
        message: 'This plan is not for sale.',
      });
    }
    const existing = await this.prisma.clientSubscription.findUnique({
      where: { user_id: user.sub },
    });
    if (clientSubscriptionActive(existing)) {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE,
        message: 'A plan is already active.',
      });
    }
    const priceId = await this.pricing.priceId(plan.price_kind);
    const amount = await this.pricing.amountOf(plan.price_kind);
    if (!priceId || amount === null) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    const { values } = await this.entitlements.forPlan(plan);
    const trialDays = existing?.trial_ends_at
      ? 0
      : entitlementNumber(values, 'trial_days');
    const u = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { email: true },
    });
    const customerId = await this.customerId(user.sub, u?.email ?? null);
    const session = await this.provider.createCheckoutSession({
      customerId,
      lineItems: [{ priceId, quantity: 1 }],
      trialDays: trialDays > 0 ? trialDays : null,
      successUrl: `${this.returnBase}/plan/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${this.returnBase}/plan/cancel`,
      metadata: {
        kind: CLIENT_PLAN_CHECKOUT_KIND,
        userId: user.sub,
        planId: plan.id,
        planCode: plan.code,
        priceCents: String(amount),
      },
    });
    if (!session.url) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'The checkout page is not available.',
      });
    }
    await this.prisma.clientSubscription.upsert({
      where: { user_id: user.sub },
      create: {
        user_id: user.sub,
        plan_id: plan.id,
        stripe_checkout_id: session.id,
        status: 'incomplete',
        price_cents: amount,
        entitlements: this.plans.entitlementsOf(plan),
      },
      update: {
        plan_id: plan.id,
        stripe_checkout_id: session.id,
        price_cents: amount,
        entitlements: this.plans.entitlementsOf(plan),
      },
    });
    return {
      url: session.url,
      sessionId: session.id,
      priceCents: amount,
      trialDays,
    };
  }

  async completeCheckout(
    user: RequestUser,
    sessionId: string,
  ): Promise<ClientPlanMeDto> {
    this.requireClient(user);
    const session = await this.provider.retrieveCheckoutSession(sessionId);
    if (session && session.metadata.userId === user.sub) {
      await this.applyCheckout(session);
    }
    return this.me(user);
  }

  async setCancel(
    user: RequestUser,
    cancel: boolean,
  ): Promise<ClientPlanMeDto> {
    this.requireClient(user);
    const row = await this.prisma.clientSubscription.findUnique({
      where: { user_id: user.sub },
    });
    if (!row?.stripe_subscription_id || !clientSubscriptionActive(row)) {
      throw new NotFoundException({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'No active plan.',
      });
    }
    if (row.cancel_at_period_end !== cancel) {
      const remote = await this.provider.setCancelAtPeriodEnd(
        row.stripe_subscription_id,
        cancel,
      );
      await this.applySubscription(remote);
    }
    return this.me(user);
  }

  // ---- payment events (webhook / the app's return) ----------------------------

  async applyCheckout(session: ProviderCheckoutSession): Promise<boolean> {
    if (session.metadata.kind !== CLIENT_PLAN_CHECKOUT_KIND) return false;
    if (session.status !== 'complete' || !session.subscriptionId) return false;
    const userId = session.metadata.userId;
    const row = userId
      ? await this.prisma.clientSubscription.findUnique({
          where: { user_id: userId },
        })
      : null;
    if (!row || row.stripe_checkout_id !== session.id) return false;
    const remote = await this.provider.retrieveSubscription(
      session.subscriptionId,
    );
    if (!remote) return false;
    // A second paid checkout while one is live: cancel the newcomer.
    if (
      row.stripe_subscription_id &&
      row.stripe_subscription_id !== remote.id &&
      clientSubscriptionActive(row)
    ) {
      if (remote.status !== 'canceled')
        await this.provider.cancelNow(remote.id);
      this.logger.error(
        `duplicate client plan ${remote.id} for ${userId} cancelled (kept ${row.stripe_subscription_id})`,
      );
      return true;
    }
    await this.prisma.clientSubscription.update({
      where: { id: row.id },
      data: { stripe_subscription_id: remote.id },
    });
    await this.applySubscription(remote);
    return true;
  }

  /** True when the provider subscription is a client plan (the attorney
   * sync then skips it). */
  async onSubscriptionEvent(subscriptionId: string): Promise<boolean> {
    const row = await this.prisma.clientSubscription.findUnique({
      where: { stripe_subscription_id: subscriptionId },
      select: { id: true },
    });
    if (!row) return false;
    const remote = await this.provider.retrieveSubscription(subscriptionId);
    if (remote) await this.applySubscription(remote);
    return true;
  }

  async applySubscription(remote: ProviderSubscription): Promise<void> {
    const row = await this.prisma.clientSubscription.findUnique({
      where: { stripe_subscription_id: remote.id },
    });
    if (!row) return;
    const before = clientSubscriptionActive(row);
    const status = mapStatus(remote.status);
    const updated = await this.prisma.clientSubscription.update({
      where: { id: row.id },
      data: {
        status,
        trial_ends_at: remote.trialEnd
          ? new Date(remote.trialEnd * 1000)
          : row.trial_ends_at,
        current_period_end: remote.currentPeriodEnd
          ? new Date(remote.currentPeriodEnd * 1000)
          : row.current_period_end,
        cancel_at_period_end: remote.cancelAtPeriodEnd,
        canceled_at: remote.canceledAt
          ? new Date(remote.canceledAt * 1000)
          : remote.cancelAtPeriodEnd
            ? (row.canceled_at ?? new Date())
            : null,
      },
    });
    await this.entitlements.invalidateUser(row.user_id);
    const after = clientSubscriptionActive(updated);
    if (before !== after || row.status !== updated.status) {
      await this.notifications
        ?.emit({
          type: 'subscription_status',
          recipientId: row.user_id,
          payload: { kind: 'client_plan', status: updated.status },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Owner 2026-10-06: «Обновить карту / Управлять оплатой» for a client —
   * the Stripe Customer Portal of the client's customer (the plan and the
   * gold badge share it): change the card, see invoices, cancel. Only a
   * client who has paid before has a customer; nothing is created here.
   */
  async portalSession(user: RequestUser): Promise<{ url: string }> {
    this.requireClient(user);
    const customer = await this.prisma.stripeCustomer.findUnique({
      where: { user_id: user.sub },
    });
    if (!customer) {
      throw new NotFoundException({
        code: ErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: 'No saved card yet: buy a plan or the badge first.',
      });
    }
    return {
      url: await this.provider.createPortalSession(
        customer.stripe_customer_id,
        `${this.returnBase}/plan`,
      ),
    };
  }

  // ---- helpers --------------------------------------------------------------------

  private requireClient(user: RequestUser): void {
    if (user.role !== 'client') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Clients only.',
      });
    }
  }

  private async safePlan(id: string): Promise<Plan | null> {
    try {
      return await this.plans.byId(id);
    } catch {
      return null;
    }
  }

  private async customerId(
    userId: string,
    email: string | null,
  ): Promise<string> {
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
}

export function mapStatus(status: ProviderSubscription['status']): string {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return status;
    case 'unpaid':
      return 'past_due';
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'expired';
  }
}

export function presentClientSubscription(
  s: ClientSubscription,
  plan: Plan | null,
): ClientSubscriptionDto {
  return {
    id: s.id,
    status: s.status,
    isActive: clientSubscriptionActive(s),
    planCode: plan?.code ?? null,
    priceCents: s.price_cents,
    trialEndsAt: s.trial_ends_at?.toISOString() ?? null,
    currentPeriodEnd: s.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    canceledAt: s.canceled_at?.toISOString() ?? null,
  };
}
