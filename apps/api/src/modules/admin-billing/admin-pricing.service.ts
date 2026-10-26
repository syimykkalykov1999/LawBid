import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PlanPrice, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AuditLogService } from '../admin-access/audit-log.service';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type { PaymentProvider } from '../billing/payment-provider';
import {
  discountOf,
  jsonMap,
  PLAN_KINDS,
  PLAN_META,
  type PlanKind,
  PricingService,
} from '../billing/pricing.service';
import type {
  MovePlanSubscribersResultDto,
  AdminPlanPricesDto,
  AdminSetPlanPriceResultDto,
} from './admin-pricing.dto';

const LIVE_SUB: SubscriptionStatus[] = ['trialing', 'active', 'past_due'];
const HISTORY = 30;

/**
 * Owner 2026-10-03: Billing → Prices. A change inserts a new active row
 * (and a new Stripe price — Stripe prices cannot be edited); new
 * purchases pay it at once, the app and the website read it from the
 * API. Existing subscribers keep their price until the admin moves them
 * ("from the next renewal", no proration).
 */
@Injectable()
export class AdminPricingService {
  private readonly logger = new Logger(AdminPricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditLogService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async list(): Promise<AdminPlanPricesDto> {
    const [rows, amounts, defaults, history, counts] = await Promise.all([
      this.pricing.activeRows(),
      this.pricing.amounts(),
      this.pricing.defaults(),
      this.prisma.planPrice.findMany({
        orderBy: { created_at: 'desc' },
        take: HISTORY,
      }),
      this.subscriberCounts(),
    ]);
    const mode = this.pricing.mode();
    return {
      currency: this.pricing.currency(),
      mode,
      items: PLAN_KINDS.map((kind) => {
        const row = rows.get(kind);
        return {
          kind,
          amountCents: amounts[kind],
          defaultCents: defaults[kind],
          isCustom: !!row,
          interval: PLAN_META[kind].interval,
          stripePriceId: row
            ? (jsonMap(row.stripe_price_ids)[mode] ?? null)
            : null,
          subscribers: counts[kind],
          updatedAt: row?.created_at.toISOString() ?? null,
          compareAtCents: row?.compare_at_cents ?? null,
          showDiscount: row?.show_discount ?? false,
          discount: discountOf(row),
        };
      }),
      history: history.map(presentHistory),
    };
  }

  async set(
    admin: AdminActor,
    kind: string,
    amountCents: number,
    note?: string,
    disc: { compareAtCents?: number | null; showDiscount?: boolean } = {},
  ): Promise<AdminSetPlanPriceResultDto> {
    const before = (await this.pricing.activeRows()).get(kind) ?? null;
    const beforeCents = await this.pricing.amountOf(kind);
    // Owner 2026-10-07: the old price and its switch ride along with a new
    // amount; absent = keep what the current row has.
    const compareAt =
      disc.compareAtCents !== undefined
        ? disc.compareAtCents
        : (before?.compare_at_cents ?? null);
    const showDiscount = disc.showDiscount ?? before?.show_discount ?? false;
    let row: PlanPrice | null = null;
    if (
      before &&
      beforeCents === amountCents &&
      (compareAt !== before.compare_at_cents ||
        showDiscount !== before.show_discount)
    ) {
      await this.prisma.planPrice.update({
        where: { id: before.id },
        data: { compare_at_cents: compareAt, show_discount: showDiscount },
      });
      this.pricing.invalidate();
      await this.audit.record({
        adminId: admin.id,
        action: 'billing.price.discount',
        targetType: 'plan_price',
        targetId: before.id,
        before: {
          kind,
          compareAtCents: before.compare_at_cents,
          showDiscount: before.show_discount,
        },
        after: { kind, compareAtCents: compareAt, showDiscount },
        ip: admin.ip,
        justification: note ?? null,
      });
    }
    if (beforeCents !== amountCents || !before) {
      row = await withTxRetry(this.prisma, async (tx) => {
        await tx.planPrice.updateMany({
          where: { kind, active: true },
          data: { active: false },
        });
        return tx.planPrice.create({
          data: {
            kind,
            amount_cents: amountCents,
            currency: this.pricing.currency(),
            note: note ?? null,
            compare_at_cents: compareAt,
            show_discount: showDiscount,
            created_by: admin.id,
          },
        });
      });
      this.pricing.invalidate();
      await this.audit.record({
        adminId: admin.id,
        action: 'billing.price.update',
        targetType: 'plan_price',
        targetId: row.id,
        before: {
          kind,
          amountCents: beforeCents,
          compareAtCents: before?.compare_at_cents ?? null,
          showDiscount: before?.show_discount ?? false,
        },
        after: { kind, amountCents, compareAtCents: compareAt, showDiscount },
        ip: admin.ip,
        justification: note ?? null,
      });
    }
    // Create the Stripe price now so a key problem shows here, not at an
    // attorney's checkout. A failure keeps the new amount; the price is
    // created at the next checkout.
    let stripeError: string | null = null;
    const current = row ?? before;
    if (current) {
      try {
        await this.pricing.ensureStripePrice(current);
      } catch (e) {
        stripeError = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `stripe price for ${kind} not created: ${stripeError}`,
        );
      }
    }
    return { ...(await this.list()), stripeError };
  }

  /** Existing subscribers of [kind] → today's price from their next renewal. */
  async moveSubscribers(
    admin: AdminActor,
    kind: PlanKind,
    reason: string,
  ): Promise<MovePlanSubscribersResultDto> {
    if (!this.provider.replaceItemPrice) {
      return { moved: 0, skipped: 0, failed: 0 };
    }
    // A Stripe key problem is a clear 503 PAYMENTS_NOT_CONFIGURED for the
    // admin, never a bare 500 ("server did not answer").
    let target: string;
    let from: string[];
    try {
      target = await this.pricing.requirePriceId(kind);
      from = (await this.pricing.knownPriceIds(kind)).filter(
        (id) => id !== target,
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(`move ${kind}: Stripe not reachable: ${String(e)}`);
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Stripe did not answer; check the Stripe key.',
      });
    }
    const amounts = await this.pricing.amounts();
    const subs = await this.targets(kind);
    let moved = 0;
    let skipped = 0;
    let failed = 0;
    for (const s of subs) {
      try {
        const res = await this.provider.replaceItemPrice(
          s.stripeId,
          from,
          target,
        );
        if (!res) {
          skipped++;
          continue;
        }
        moved++;
        if (s.subscriptionRowId) {
          await this.prisma.subscription.update({
            where: { id: s.subscriptionRowId },
            data: {
              price_cents:
                kind === 'yearly'
                  ? amounts.yearly
                  : amounts.monthly + s.seats * amounts.seat,
            },
          });
        }
      } catch (e) {
        failed++;
        this.logger.warn(`move ${kind} ${s.stripeId} failed: ${String(e)}`);
      }
    }
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.price.move_subscribers',
      targetType: 'plan_price',
      targetId: kind,
      after: { kind, priceId: target, moved, skipped, failed },
      ip: admin.ip,
      justification: reason,
    });
    return { moved, skipped, failed };
  }

  private async targets(
    kind: PlanKind,
  ): Promise<
    { stripeId: string; subscriptionRowId: string | null; seats: number }[]
  > {
    if (kind === 'client_badge') {
      const rows = await this.prisma.clientVerification.findMany({
        where: {
          stripe_subscription_id: { not: null },
          sub_status: { in: ['active', 'past_due'] },
        },
        select: { stripe_subscription_id: true },
      });
      return rows.map((r) => ({
        stripeId: r.stripe_subscription_id!,
        subscriptionRowId: null,
        seats: 0,
      }));
    }
    const rows = await this.prisma.subscription.findMany({
      where: {
        stripe_subscription_id: { not: null },
        status: { in: LIVE_SUB },
        plan: kind === 'yearly' ? 'yearly' : 'monthly',
        ...(kind === 'seat' ? { assistant_seats: { gt: 0 } } : {}),
      },
      select: { id: true, stripe_subscription_id: true, assistant_seats: true },
    });
    return rows.map((r) => ({
      stripeId: r.stripe_subscription_id!,
      subscriptionRowId: r.id,
      seats: r.assistant_seats,
    }));
  }

  private async subscriberCounts(): Promise<Record<PlanKind, number>> {
    const live = { status: { in: LIVE_SUB } };
    const [monthly, seat, yearly, badge] = await Promise.all([
      this.prisma.subscription.count({ where: { ...live, plan: 'monthly' } }),
      this.prisma.subscription.count({
        where: { ...live, plan: 'monthly', assistant_seats: { gt: 0 } },
      }),
      this.prisma.subscription.count({ where: { ...live, plan: 'yearly' } }),
      this.prisma.clientVerification.count({
        where: { sub_status: { in: ['active', 'past_due'] } },
      }),
    ]);
    return { monthly, seat, yearly, client_badge: badge };
  }
}

function presentHistory(r: PlanPrice) {
  return {
    id: r.id,
    kind: r.kind as PlanKind,
    amountCents: r.amount_cents,
    active: r.active,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
  };
}
