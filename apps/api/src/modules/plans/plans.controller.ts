import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Plan } from '@prisma/client';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PricingService, seatPriceKind } from '../billing/pricing.service';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import {
  type Audience,
  catalogFor,
  type Entitlements,
} from './entitlement-catalog';
import { EntitlementsService } from './entitlements.service';
import {
  type EntitlementDefDto,
  MyEntitlementsDto,
  PlansListDto,
  PlansQueryDto,
  type PublicPlanDto,
} from './plans.dto';
import { highlights, PlansService, text } from './plans.service';

/** Owner 2026-10-05: the plan list the app's "choose a plan" screen shows
 * (public, like /pricing) and the signed-in user's own entitlements. */
@ApiTags('plans')
@Controller()
export class PlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly pricing: PricingService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Public()
  @SkipVersionCheck()
  @Get('plans')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Purchasable plans of an audience, with prices' })
  @ApiEnvelopeResponse(PlansListDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async listPlans(@Query() q: PlansQueryDto): Promise<PlansListDto> {
    const audience: Audience = q.audience ?? 'attorney';
    const [plans, baseline] = await Promise.all([
      this.plans.purchasable(audience),
      this.plans.baseline(audience),
    ]);
    return {
      audience,
      plans: await Promise.all(plans.map((p) => this.present(p))),
      baseline: baseline ? await this.present(baseline) : null,
      catalog: catalogDtos(audience),
    };
  }

  @ApiBearerAuth()
  @ApiErrors(AUTHENTICATED_ERRORS)
  @Get('me/entitlements')
  @ApiOperation({ summary: "The signed-in user's plan and entitlements" })
  @ApiEnvelopeResponse(MyEntitlementsDto)
  async myEntitlements(
    @CurrentUser() user: RequestUser,
  ): Promise<MyEntitlementsDto> {
    const r = await this.entitlements.forUser(user.sub);
    return { ...r, catalog: catalogDtos(r.audience) };
  }

  /** Shared with the subscription "me" endpoints. */
  async present(plan: Plan): Promise<PublicPlanDto> {
    return presentPlan(plan, this.plans, this.pricing);
  }
}

export function catalogDtos(audience: Audience): EntitlementDefDto[] {
  return catalogFor(audience)
    .filter((d) => !d.hidden)
    .map((d) => ({
      key: d.key,
      type: d.type,
      audiences: d.audiences,
      group: d.group,
      label: d.label,
      description: d.description,
      min: d.min,
      max: d.max,
      zeroIsUnlimited: d.zeroIsUnlimited,
    }));
}

/** A plan with today's price (its own row, else the legacy kind). */
export async function presentPlan(
  plan: Plan,
  plans: PlansService,
  pricing: PricingService,
): Promise<PublicPlanDto> {
  const ent: Entitlements = plans.entitlementsOf(plan);
  const amount =
    plan.kind === 'paid' && plan.price_kind
      ? await pricing.amountOf(plan.price_kind)
      : null;
  let extraSeat: number | null = null;
  if (plan.audience === 'attorney' && plan.kind === 'paid') {
    const own = ent.extra_seat_price_cents;
    extraSeat =
      typeof own === 'number'
        ? ((await pricing.amountOf(seatPriceKind(plan.code))) ?? own)
        : await pricing.amount('seat');
  }
  return {
    id: plan.id,
    code: plan.code,
    audience: plan.audience as Audience,
    kind: plan.kind,
    name: text(plan.name),
    tagline: text(plan.tagline),
    description: text(plan.description),
    interval:
      plan.interval === 'year'
        ? 'year'
        : plan.interval === 'month'
          ? 'month'
          : null,
    currency: pricing.currency(),
    amountCents: amount,
    extraSeatCents: extraSeat,
    discount:
      plan.kind === 'paid' && plan.price_kind
        ? await pricing.discount(plan.price_kind)
        : null,
    entitlements: ent,
    highlights: highlights(plan.highlights),
    isDefault: plan.is_default,
    trialDays: await pricing.trialDaysFor(plan),
  };
}
