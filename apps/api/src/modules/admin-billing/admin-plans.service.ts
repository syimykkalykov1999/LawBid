import { ConflictException, Injectable, Optional } from '@nestjs/common';
import type { Plan, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  jsonMap,
  planPriceKind,
  PricingService,
  seatPriceKind,
} from '../billing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  type Audience,
  ENTITLEMENT_CATALOG,
  sanitizeEntitlements,
} from '../plans/entitlement-catalog';
import { EntitlementsService } from '../plans/entitlements.service';
import { catalogDtos, presentPlan } from '../plans/plans.controller';
import { PlansService } from '../plans/plans.service';
import { AdminPricingService } from './admin-pricing.service';
import type {
  AdminPlanDto,
  AdminPlanResultDto,
  AdminPlansDto,
  ApplyPlanResultDto,
  CreatePlanDto,
  PlanFieldsDto,
} from './admin-plans.dto';

const LIVE_ATTORNEY: Prisma.SubscriptionWhereInput = {
  status: { in: ['trialing', 'active', 'past_due'] },
};
const LIVE_CLIENT: Prisma.ClientSubscriptionWhereInput = {
  status: { in: ['trialing', 'active', 'past_due'] },
};

/**
 * Owner 2026-10-05: Деньги → Планы — the plan builder. The super admin
 * creates plans, switches entitlements on and off, sets prices (through
 * the Prices rows → Stripe), archives. Subscribers keep the terms frozen
 * on their row until "apply to current subscribers".
 */
@Injectable()
export class AdminPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly entitlements: EntitlementsService,
    private readonly pricing: PricingService,
    private readonly prices: AdminPricingService,
    private readonly audit: AuditLogService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async list(): Promise<AdminPlansDto> {
    const rows = await this.plans.all();
    const mode = this.pricing.mode();
    const priceRows = await this.pricing.activeRows();
    const plans: AdminPlanDto[] = [];
    for (const p of rows) {
      const pub = await presentPlan(p, this.plans, this.pricing);
      const row = p.price_kind ? priceRows.get(p.price_kind) : undefined;
      plans.push({
        ...pub,
        status: p.status,
        sort: p.sort,
        subscribers: await this.subscribers(p),
        stripePriceId: row
          ? (jsonMap(row.stripe_price_ids)[mode] ?? null)
          : null,
        priceKind: p.price_kind,
        updatedAt: p.updated_at.toISOString(),
        compareAtCents: row?.compare_at_cents ?? null,
        showDiscount: row?.show_discount ?? false,
      });
    }
    return {
      currency: this.pricing.currency(),
      mode,
      plans,
      catalog: ENTITLEMENT_CATALOG.map((d) => ({
        key: d.key,
        type: d.type,
        audiences: d.audiences,
        group: d.group,
        label: d.label,
        description: d.description,
        min: d.min,
        max: d.max,
        zeroIsUnlimited: d.zeroIsUnlimited,
      })),
      _localized: [],
    };
  }

  async create(
    admin: AdminActor,
    dto: CreatePlanDto,
  ): Promise<AdminPlanResultDto> {
    if (await this.plans.byCode(dto.code)) {
      throw new ConflictException({
        code: ErrorCode.PLAN_CODE_EXISTS,
        message: 'A plan with this code exists.',
      });
    }
    const audience = dto.audience;
    const entitlements = sanitizeEntitlements(audience, dto.entitlements ?? {});
    const plan = await this.prisma.plan.create({
      data: {
        code: dto.code,
        audience,
        kind: 'paid',
        name: localized(dto.name),
        tagline: localized(dto.tagline),
        description: localized(dto.description),
        interval: dto.interval,
        price_kind: planPriceKind(dto.code),
        entitlements: entitlements,
        highlights: highlightsJson(dto.highlights),
        status: dto.status ?? 'draft',
        sort: dto.sort ?? 100,
        is_default: false,
        created_by: admin.id,
      },
    });
    await this.entitlements.invalidateAll();
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.plan.create',
      targetType: 'plan',
      targetId: plan.id,
      after: {
        code: plan.code,
        audience,
        entitlements,
        amountCents: dto.amountCents,
      },
      ip: admin.ip,
      justification: dto.note ?? null,
    });
    const stripeError = await this.syncPrices(admin, plan, dto);
    if (dto.isDefault) await this.makeDefault(plan);
    return { ...(await this.list()), stripeError };
  }

  async update(
    admin: AdminActor,
    id: string,
    dto: PlanFieldsDto,
  ): Promise<AdminPlanResultDto> {
    const plan = await this.plans.byId(id);
    const audience = plan.audience as Audience;
    const data: Prisma.PlanUpdateInput = {};
    if (dto.name) data.name = localized(dto.name);
    if (dto.tagline) data.tagline = localized(dto.tagline);
    if (dto.description) data.description = localized(dto.description);
    if (dto.entitlements) {
      data.entitlements = sanitizeEntitlements(audience, dto.entitlements);
    }
    if (dto.highlights) data.highlights = highlightsJson(dto.highlights);
    if (dto.status && plan.kind === 'paid') data.status = dto.status;
    if (dto.sort !== undefined) data.sort = dto.sort;
    const updated = await this.prisma.plan.update({ where: { id }, data });
    await this.entitlements.invalidateAll();
    if (dto.isDefault && updated.kind === 'paid')
      await this.makeDefault(updated);
    // The owner toggles a feature on or off and expects it to apply to
    // everyone on the plan right away (default); prices never move here.
    let applied = 0;
    if (dto.applyNow !== false && dto.entitlements) {
      applied = await this.pushTerms(updated, true);
    }
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.plan.update',
      targetType: 'plan',
      targetId: id,
      before: { entitlements: plan.entitlements, status: plan.status },
      after: {
        entitlements: updated.entitlements,
        status: updated.status,
        appliedToSubscribers: applied,
        ...(dto.amountCents !== undefined
          ? { amountCents: dto.amountCents }
          : {}),
      },
      ip: admin.ip,
      justification: dto.note ?? null,
    });
    const stripeError =
      updated.kind === 'paid'
        ? await this.syncPrices(admin, updated, dto)
        : null;
    return { ...(await this.list()), stripeError };
  }

  /** Archived: no new purchases; current subscribers keep their terms. */
  async archive(admin: AdminActor, id: string): Promise<AdminPlansDto> {
    const plan = await this.plans.byId(id);
    if (plan.kind !== 'paid') {
      throw new ConflictException({
        code: ErrorCode.PLAN_IN_USE,
        message: 'The baseline plan cannot be archived.',
      });
    }
    await this.prisma.plan.update({
      where: { id },
      data: { status: 'archived', is_default: false },
    });
    await this.entitlements.invalidateAll();
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.plan.archive',
      targetType: 'plan',
      targetId: id,
      ip: admin.ip,
    });
    return this.list();
  }

  /** A draft nobody ever bought can go. */
  async remove(admin: AdminActor, id: string): Promise<AdminPlansDto> {
    const plan = await this.plans.byId(id);
    const used =
      plan.kind !== 'paid' ||
      (await this.prisma.subscription.count({ where: { plan_id: id } })) > 0 ||
      (await this.prisma.clientSubscription.count({ where: { plan_id: id } })) >
        0;
    if (used) {
      throw new ConflictException({
        code: ErrorCode.PLAN_IN_USE,
        message: 'The plan has subscribers — archive it instead.',
      });
    }
    await this.prisma.plan.delete({ where: { id } });
    await this.entitlements.invalidateAll();
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.plan.delete',
      targetType: 'plan',
      targetId: id,
      before: { code: plan.code },
      ip: admin.ip,
    });
    return this.list();
  }

  /** Current subscribers get the plan's terms as they are now. */
  async applyToSubscribers(
    admin: AdminActor,
    id: string,
    reason: string,
  ): Promise<ApplyPlanResultDto> {
    const plan = await this.plans.byId(id);
    const count = await this.pushTerms(plan, true);
    await this.audit.record({
      adminId: admin.id,
      action: 'billing.plan.apply_to_subscribers',
      targetType: 'plan',
      targetId: id,
      after: { updated: count },
      ip: admin.ip,
      justification: reason,
    });
    return { updated: count };
  }

  /**
   * Replaces the frozen terms of everyone currently on the plan with the
   * plan's live entitlements and tells them. Returns how many changed.
   */
  private async pushTerms(plan: Plan, notify: boolean): Promise<number> {
    const id = plan.id;
    const snapshot = this.plans.entitlementsOf(plan) as Prisma.InputJsonObject;
    let recipients: string[] = [];
    if (plan.audience === 'attorney') {
      const rows = await this.prisma.subscription.findMany({
        where: { plan_id: id, ...LIVE_ATTORNEY },
        select: { user_id: true },
      });
      await this.prisma.subscription.updateMany({
        where: { plan_id: id, ...LIVE_ATTORNEY },
        data: { entitlements: snapshot },
      });
      recipients = rows.map((r) => r.user_id);
    } else {
      const rows = await this.prisma.clientSubscription.findMany({
        where: { plan_id: id, ...LIVE_CLIENT },
        select: { user_id: true },
      });
      await this.prisma.clientSubscription.updateMany({
        where: { plan_id: id, ...LIVE_CLIENT },
        data: { entitlements: snapshot },
      });
      recipients = rows.map((r) => r.user_id);
    }
    await this.entitlements.invalidateAll();
    if (notify) {
      for (const userId of recipients) {
        await this.notifications
          ?.emit({
            type: 'subscription_status',
            recipientId: userId,
            payload: { kind: 'plan_terms_updated', planCode: plan.code },
          })
          .catch(() => undefined);
      }
    }
    return recipients.length;
  }

  // ------------------------------------------------------------------

  /** The plan's price row (and its extra-seat row) follow the request. */
  private async syncPrices(
    admin: AdminActor,
    plan: Plan,
    dto: PlanFieldsDto,
  ): Promise<string | null> {
    let stripeError: string | null = null;
    const discount =
      dto.compareAtCents !== undefined || dto.showDiscount !== undefined;
    if ((dto.amountCents !== undefined || discount) && plan.price_kind) {
      const amount =
        dto.amountCents ?? (await this.pricing.amountOf(plan.price_kind));
      if (amount != null) {
        const r = await this.prices.set(
          admin,
          plan.price_kind,
          amount,
          dto.note,
          {
            compareAtCents: dto.compareAtCents,
            showDiscount: dto.showDiscount,
          },
        );
        stripeError = r.stripeError ?? stripeError;
      }
    }
    const ent = this.plans.entitlementsOf(plan);
    const seat = ent.extra_seat_price_cents;
    if (plan.audience === 'attorney' && typeof seat === 'number') {
      const kind = seatPriceKind(plan.code);
      if ((await this.pricing.amountOf(kind)) !== seat) {
        const r = await this.prices.set(admin, kind, seat, dto.note);
        stripeError = r.stripeError ?? stripeError;
      }
    }
    return stripeError;
  }

  private async makeDefault(plan: Plan): Promise<void> {
    await this.prisma.plan.updateMany({
      where: {
        audience: plan.audience,
        interval: plan.interval,
        id: { not: plan.id },
      },
      data: { is_default: false },
    });
    await this.prisma.plan.update({
      where: { id: plan.id },
      data: { is_default: true },
    });
    await this.entitlements.invalidateAll();
  }

  private async subscribers(plan: Plan): Promise<number> {
    if (plan.kind !== 'paid') return 0;
    if (plan.audience === 'client') {
      return this.prisma.clientSubscription.count({
        where: { plan_id: plan.id, ...LIVE_CLIENT },
      });
    }
    const own = await this.prisma.subscription.count({
      where: { plan_id: plan.id, ...LIVE_ATTORNEY },
    });
    if (!plan.is_default) return own;
    const legacy = await this.prisma.subscription.count({
      where: {
        plan_id: null,
        plan: plan.interval === 'year' ? 'yearly' : 'monthly',
        ...LIVE_ATTORNEY,
      },
    });
    return own + legacy;
  }
}

function localized(v?: { en?: string; ru?: string }): Prisma.InputJsonObject {
  const out: Record<string, string> = {};
  if (v?.en) out.en = v.en;
  if (v?.ru) out.ru = v.ru;
  return out;
}

function highlightsJson(
  v?: { en?: string; ru?: string }[],
): Prisma.InputJsonArray {
  return (v ?? [])
    .map(localized)
    .filter((t) => Object.keys(t).length > 0)
    .slice(0, 20);
}

export { catalogDtos };
