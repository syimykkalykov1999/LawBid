import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ASSISTANT_SEAT_PRICE_CENTS,
  SUBSCRIPTION_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
} from '../billing/billing.constants';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import {
  effectiveSeats,
  paidSeats,
} from '../subscriptions/contract-grant.util';
import type {
  AdminBillingSubscriptionRowDto,
  AdminBillingSubscriptionsQueryDto,
  BillingOverviewDto,
} from './admin-billing.dto';
import {
  ADMIN_BILLING_PAGE,
  afterCursor,
  type Page,
  toPage,
  usersById,
} from './admin-billing.util';
import { LIVE_REFUND_STATUSES } from './refunds.service';

const DAY = 86_400_000;

/** Statuses that bill (MRR). Trials count, but at $0. */
export const MRR_STATUSES = ['active', 'past_due'] as const;

/** Monthly value of a plan in cents (not rounded): the list prices, not
 * `price_cents` — that column already includes the seats. */
export function monthlyEquivalentCents(plan: string, seats: number): number {
  return plan === 'yearly'
    ? YEARLY_PRICE_CENTS / 12
    : SUBSCRIPTION_PRICE_CENTS + seats * ASSISTANT_SEAT_PRICE_CENTS;
}

/** MRR over (status, plan, seats) groups; trialing and others are $0. */
export function computeMrrCents(
  groups: { status: string; plan: string; seats: number; count: number }[],
): number {
  let total = 0;
  for (const g of groups) {
    if (!(MRR_STATUSES as readonly string[]).includes(g.status)) continue;
    total += monthlyEquivalentCents(g.plan, g.seats) * g.count;
  }
  return Math.round(total);
}

/** Owner 2026-10-02: the admin's billing dashboard and subscriptions list. */
@Injectable()
export class BillingOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<BillingOverviewDto> {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY);
    const [groups, grants, gross, refunds, redemptions] = await Promise.all([
      this.prisma.subscription.groupBy({
        by: ['status', 'plan', 'assistant_seats'],
        where: { status: { in: ['trialing', 'active', 'past_due'] } },
        _count: { _all: true },
      }),
      this.prisma.contractGrant.count({
        where: {
          revoked_at: null,
          starts_at: { lte: now },
          ends_at: { gt: now },
        },
      }),
      this.prisma.payment.aggregate({
        // A refunded payment was still paid; its refunds are subtracted.
        where: {
          status: { in: ['succeeded', 'refunded'] },
          paid_at: { gte: d30 },
        },
        _sum: { amount_cents: true },
      }),
      this.prisma.refund.aggregate({
        where: {
          status: { in: LIVE_REFUND_STATUSES },
          created_at: { gte: d30 },
        },
        _sum: { amount_cents: true },
        _count: { _all: true },
      }),
      this.prisma.promoRedemption.count({
        where: { created_at: { gte: d30 } },
      }),
    ]);
    const rows = groups.map((g) => ({
      status: g.status,
      plan: g.plan,
      seats: g.assistant_seats,
      count: g._count._all,
    }));
    const count = (pred: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(pred).reduce((n, r) => n + r.count, 0);
    const billing = (r: (typeof rows)[number]) =>
      (MRR_STATUSES as readonly string[]).includes(r.status);
    const grossCents = gross._sum.amount_cents ?? 0;
    const refundCents = refunds._sum.amount_cents ?? 0;
    return {
      mrrCents: computeMrrCents(rows),
      subscriptions: {
        active: count((r) => r.status === 'active'),
        trialing: count((r) => r.status === 'trialing'),
        pastDue: count((r) => r.status === 'past_due'),
        monthly: count((r) => billing(r) && r.plan === 'monthly'),
        yearly: count((r) => billing(r) && r.plan === 'yearly'),
      },
      contractGrantsActive: grants,
      revenue30dCents: grossCents - refundCents,
      grossRevenue30dCents: grossCents,
      refunds30dCents: refundCents,
      refunds30dCount: refunds._count._all,
      promoRedemptions30d: redemptions,
      generatedAt: now.toISOString(),
    };
  }

  async subscriptions(
    q: AdminBillingSubscriptionsQueryDto,
  ): Promise<Page<AdminBillingSubscriptionRowDto>> {
    const now = new Date();
    const activeGrantWhere: Prisma.ContractGrantWhereInput = {
      revoked_at: null,
      starts_at: { lte: now },
      ends_at: { gt: now },
    };
    let grantUsers: string[] | null = null;
    if (q.hasContractGrant !== undefined) {
      const g = await this.prisma.contractGrant.findMany({
        where: activeGrantWhere,
        select: { user_id: true },
        distinct: ['user_id'],
      });
      grantUsers = g.map((x) => x.user_id);
    }
    const term = q.q?.toLowerCase();
    const rows = await this.prisma.subscription.findMany({
      where: {
        AND: [
          q.status ? { status: q.status } : {},
          q.plan ? { plan: q.plan } : {},
          q.trialEndsWithinDays
            ? {
                status: 'trialing' as const,
                trial_ends_at: {
                  gte: now,
                  lte: new Date(
                    now.getTime() + q.trialEndsWithinDays * 86_400_000,
                  ),
                },
              }
            : {},
          q.renewsWithinDays
            ? {
                current_period_end: {
                  gte: now,
                  lte: new Date(
                    now.getTime() + q.renewsWithinDays * 86_400_000,
                  ),
                },
              }
            : {},
          q.seats === 'none' ? { assistant_seats: 0 } : {},
          q.seats === 'some' ? { assistant_seats: { gte: 1, lte: 5 } } : {},
          q.seats === 'full' ? { assistant_seats: { gte: 6 } } : {},
          q.cancelAtPeriodEnd !== undefined
            ? { cancel_at_period_end: q.cancelAtPeriodEnd }
            : {},
          q.hadTrial !== undefined
            ? { trial_started_at: q.hadTrial ? { not: null } : null }
            : {},
          grantUsers
            ? q.hasContractGrant
              ? { user_id: { in: grantUsers } }
              : { user_id: { notIn: grantUsers } }
            : {},
          term
            ? {
                user: {
                  OR: [
                    { full_name_lower: { contains: term } },
                    { email: { contains: term, mode: 'insensitive' } },
                  ],
                },
              }
            : {},
          afterCursor(q.cursor),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: ADMIN_BILLING_PAGE + 1,
    });
    const page = rows.slice(0, ADMIN_BILLING_PAGE);
    const ids = page.map((r) => r.user_id);
    const [users, customers, grants] = await Promise.all([
      usersById(this.prisma, ids),
      ids.length
        ? this.prisma.stripeCustomer.findMany({
            where: { user_id: { in: ids } },
            select: { user_id: true, stripe_customer_id: true },
          })
        : [],
      ids.length
        ? this.prisma.contractGrant.findMany({
            where: { ...activeGrantWhere, user_id: { in: ids } },
            select: {
              id: true,
              user_id: true,
              ends_at: true,
              assistant_seats: true,
            },
            orderBy: { ends_at: 'desc' },
          })
        : [],
    ]);
    const customerOf = new Map(
      customers.map((c) => [c.user_id, c.stripe_customer_id]),
    );
    const grantOf = new Map<
      string,
      { id: string; endsAt: string; assistantSeats: number }
    >();
    for (const g of grants) {
      const cur = grantOf.get(g.user_id);
      // Latest end first (ordered); seats = the most among them.
      grantOf.set(g.user_id, {
        id: cur?.id ?? g.id,
        endsAt: cur?.endsAt ?? g.ends_at.toISOString(),
        assistantSeats: Math.max(cur?.assistantSeats ?? 0, g.assistant_seats),
      });
    }
    return toPage(rows, ADMIN_BILLING_PAGE, (s) => {
      const grant = grantOf.get(s.user_id) ?? null;
      return {
        id: s.id,
        userId: s.user_id,
        user: users.get(s.user_id) ?? null,
        status: s.status,
        plan: s.plan,
        assistantSeats: s.assistant_seats,
        effectiveSeats: effectiveSeats(
          paidSeats(s),
          grant?.assistantSeats ?? null,
        ),
        priceCents: s.price_cents,
        monthlyEquivalentCents: Math.round(
          monthlyEquivalentCents(s.plan, s.assistant_seats),
        ),
        trialEndsAt: s.trial_ends_at?.toISOString() ?? null,
        currentPeriodEnd: s.current_period_end?.toISOString() ?? null,
        graceEndsAt: s.grace_ends_at?.toISOString() ?? null,
        cancelAtPeriodEnd: s.cancel_at_period_end,
        stripeSubscriptionId: s.stripe_subscription_id,
        stripeCustomerId: customerOf.get(s.user_id) ?? null,
        isActive: SubscriptionAccessService.rowIsActive(s, now) || !!grant,
        contractGrant: grant,
        createdAt: s.created_at.toISOString(),
      };
    });
  }
}
