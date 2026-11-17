import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Subscription } from '../../generated/prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { hotlineModeFrom } from '../../common/app-settings/hotline-settings';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { FeatureFlagsService } from '../feature-flags/feature-flags.public';
import {
  EntitlementsService,
  type ResolvedEntitlements,
} from '../plans/entitlements.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER, SUBSCRIPTION_CURRENCY } from './billing.constants';
import type {
  HotlineAddonDto,
  HotlineAddonPreviewDto,
  SeatChangeResultDto,
} from './billing.dto';
import {
  HOTLINE_ADDON_PRICE_KEY,
  hotlineAddonOffer,
} from './hotline-addon.logic';
import type { PaymentProvider } from './payment-provider';
import { hotlinePriceKind, PricingService } from './pricing.service';
import { SEAT_PREVIEW_TTL_SEC } from './seats.service';
import { SubscriptionsService } from './subscriptions.service';

const HOTLINE_FLAG = 'hotline';

interface AddonContext {
  row: Subscription & { stripe_subscription_id: string };
  priceId: string;
  knownPriceIds: string[];
  cents: number;
}

/**
 * Owner row 87 (16.11, plan PR 8) — the «Горячая линия» add-on, an item of
 * the attorney's ONE Stripe subscription next to the plan and the assistant
 * seats, bought and dropped exactly like a seat (SeatsService, owner
 * 2026-10-22, Slack's model):
 * 1. On = the prorated rest of the current period is charged NOW on its
 *    own invoice (`always_invoice` at the preview's `proration_date`,
 *    `pending_if_incomplete`, an idempotency key), then the add-on recurs
 *    in the monthly invoice. It is usable once that invoice is paid (at
 *    once, or after 3-D Secure via the webhook).
 * 2. Off = no refund and no credit (owner: no refunds): the item leaves
 *    Stripe at once with `proration_behavior: none`, so the next invoice is
 *    already without it, and the add-on stays usable until the end of the
 *    period already paid (`hotline_addon_ends_at`). On again before then
 *    costs nothing — the period is paid.
 * 3. Bought only after the first PAID period, like seats.
 */
@Injectable()
export class HotlineAddonService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly pricing: PricingService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.subscriptions.setHotlineAddonView((userId, row, resolved) =>
      this.view(userId, row, resolved),
    );
  }

  /** The card's row: what the add-on costs and where it stands; null when
   * the attorney's plan does not offer it (or the line is not by plan). */
  async view(
    userId: string,
    row: Subscription | null,
    resolved: ResolvedEntitlements,
  ): Promise<HotlineAddonDto | null> {
    const offered = await this.offerCents(resolved);
    const kept = row?.hotline_addon ?? false;
    const endsAt = row?.hotline_addon_ends_at ?? null;
    const usableLeft = !kept && !!endsAt && endsAt.getTime() > Date.now();
    // A bought add-on is shown even if the plan stopped offering it (the
    // attorney must be able to turn it off).
    if (offered === null && !kept && !usableLeft) return null;
    const kind = resolved.planCode ? hotlinePriceKind(resolved.planCode) : null;
    const priceCents =
      (kind ? await this.pricing.amountOf(kind) : null) ?? offered ?? 0;
    return {
      priceCents,
      currency: SUBSCRIPTION_CURRENCY,
      active: kept || usableLeft,
      renews: kept,
      endsAt: usableLeft ? endsAt.toISOString() : null,
      pending: !!row?.hotline_addon_invoice_id && !kept,
      canBuy: offered !== null && (await this.paidPeriod(userId, row)),
    };
  }

  /** POST /subscriptions/hotline/preview — «К оплате сейчас». */
  async preview(user: RequestUser): Promise<HotlineAddonPreviewDto> {
    const ctx = await this.context(user, true);
    const row = ctx.row;
    const prorationDate = Math.floor(Date.now() / 1000);
    const base = {
      currency: SUBSCRIPTION_CURRENCY,
      prorationDate,
      periodEnd: row.current_period_end?.toISOString() ?? null,
      priceCents: ctx.cents,
      monthlyIncreaseCents: ctx.cents,
      nextChargeCents: row.price_cents + (row.hotline_addon ? 0 : ctx.cents),
    };
    // On already, or removed but the period is paid: nothing to pay now.
    if (row.hotline_addon || this.paidUntilLater(row)) {
      return { ...base, amountNowCents: 0, taxCents: null };
    }
    const p = await this.provider.previewSeatIncrease({
      subscriptionId: row.stripe_subscription_id,
      seatPriceId: ctx.priceId,
      knownSeatPriceIds: ctx.knownPriceIds,
      addSeats: 1,
      prorationDate,
      automaticTax: await this.subscriptions.stripeTaxEnabled(),
    });
    return {
      ...base,
      amountNowCents: p.amountNowCents,
      taxCents: p.taxCents ?? null,
      currency: p.currency || SUBSCRIPTION_CURRENCY,
      periodEnd: p.periodEnd
        ? new Date(p.periodEnd * 1000).toISOString()
        : base.periodEnd,
    };
  }

  /** POST /subscriptions/hotline — on (charged now) or off (period end). */
  async set(
    user: RequestUser,
    enabled: boolean,
    prorationDate?: number,
  ): Promise<SeatChangeResultDto> {
    if (!enabled) return this.turnOff(user);
    const ctx = await this.context(user, true);
    const row = ctx.row;
    if (row.hotline_addon) return this.result(user, 'applied');
    if (this.paidUntilLater(row)) {
      // Removed this period, still paid: back on Stripe for the next
      // invoice, nothing charged now.
      await this.provider.setSeatQuantity(
        row.stripe_subscription_id,
        ctx.priceId,
        1,
        ctx.knownPriceIds,
        'none',
      );
      await this.prisma.subscription.update({
        where: { id: row.id },
        data: {
          hotline_addon: true,
          hotline_addon_ends_at: null,
          price_cents: row.price_cents + ctx.cents,
        },
      });
      await this.entitlements.invalidateUser(user.sub);
      return this.result(user, 'applied');
    }
    await this.assertPaidPeriod(row);
    const now = Math.floor(Date.now() / 1000);
    const at = prorationDate ?? now;
    if (at > now + 60 || now - at > SEAT_PREVIEW_TTL_SEC) {
      throw new ConflictException({
        code: ErrorCode.SEATS_PREVIEW_STALE,
        message: 'The price is out of date — check it again.',
      });
    }
    const charge = await this.provider.chargeSeatIncrease({
      subscriptionId: row.stripe_subscription_id,
      seatPriceId: ctx.priceId,
      knownSeatPriceIds: ctx.knownPriceIds,
      quantity: 1,
      prorationDate: at,
      // One purchase per period moment: a double tap or a retry after a
      // timeout is the same Stripe update (and the same invoice).
      idempotencyKey: `hotline-addon:${user.sub}:${row.stripe_subscription_id}:${at}`,
      automaticTax: await this.subscriptions.stripeTaxEnabled(),
    });
    if (charge.status === 'applied') {
      await this.prisma.subscription.update({
        where: { id: row.id },
        data: {
          hotline_addon: true,
          hotline_addon_ends_at: null,
          hotline_addon_invoice_id: null,
          price_cents: row.price_cents + ctx.cents,
        },
      });
      await this.entitlements.invalidateUser(user.sub);
    } else if (charge.status === 'requires_action') {
      // 3-D Secure: the webhook (pending_update_applied / invoice.paid)
      // turns it on once the bank says yes.
      await this.prisma.subscription.update({
        where: { id: row.id },
        data: { hotline_addon_invoice_id: charge.invoiceId },
      });
    }
    return this.result(user, charge.status, {
      clientSecret: charge.clientSecret,
      amountCents: charge.amountCents,
      currency: charge.currency,
    });
  }

  /** Off: free, usable until the end of the paid period (no refund). */
  private async turnOff(user: RequestUser): Promise<SeatChangeResultDto> {
    const ctx = await this.context(user, false);
    const row = ctx.row;
    if (!row.hotline_addon) {
      return this.result(user, 'applied', {
        effectiveAt: row.hotline_addon_ends_at?.toISOString() ?? null,
      });
    }
    await this.provider.setSeatQuantity(
      row.stripe_subscription_id,
      ctx.priceId,
      0,
      ctx.knownPriceIds,
      'none',
    );
    const effectiveAt = row.current_period_end ?? new Date();
    await this.prisma.subscription.update({
      where: { id: row.id },
      data: {
        hotline_addon: false,
        hotline_addon_ends_at: effectiveAt,
        hotline_addon_invoice_id: null,
        price_cents: Math.max(0, row.price_cents - ctx.cents),
      },
    });
    await this.entitlements.invalidateUser(user.sub);
    return this.result(user, 'scheduled', {
      effectiveAt: effectiveAt.toISOString(),
    });
  }

  // --- helpers -------------------------------------------------------------

  /** The plan's add-on price when the card should offer it, else null. */
  private async offerCents(
    resolved: ResolvedEntitlements,
  ): Promise<number | null> {
    if (resolved.audience !== 'attorney') return null;
    const flagOn = this.flags
      ? await this.flags.isEnabled(HOTLINE_FLAG, false)
      : false;
    const raw = this.settings ? await this.settings.all() : {};
    return hotlineAddonOffer({
      flagOn,
      mode: hotlineModeFrom(raw),
      planCode: resolved.planCode,
      values: resolved.values,
    });
  }

  private paidUntilLater(row: Subscription): boolean {
    return (
      !row.hotline_addon &&
      !!row.hotline_addon_ends_at &&
      row.hotline_addon_ends_at.getTime() > Date.now()
    );
  }

  private async result(
    user: RequestUser,
    status: SeatChangeResultDto['status'],
    extra: Partial<Omit<SeatChangeResultDto, 'status' | 'overview'>> = {},
  ): Promise<SeatChangeResultDto> {
    const overview = await this.subscriptions.me(user);
    return {
      ...overview,
      status,
      clientSecret: extra.clientSecret ?? null,
      amountCents: extra.amountCents ?? 0,
      currency: extra.currency || SUBSCRIPTION_CURRENCY,
      effectiveAt: extra.effectiveAt ?? null,
      changeId: null,
      overview,
    };
  }

  /** [buying]: the plan must offer the add-on now; turning it off works
   * whatever the plan says today. */
  private async context(
    user: RequestUser,
    buying: boolean,
  ): Promise<AddonContext> {
    await this.subscriptions.assertVerifiedAttorney(user);
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
    const resolved = await this.entitlements.forUser(user.sub);
    const offered = await this.offerCents(resolved);
    if (!resolved.planCode || (buying && offered === null)) {
      throw new ConflictException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan has no hotline add-on.',
        details: { entitlement: HOTLINE_ADDON_PRICE_KEY },
      });
    }
    const kind = hotlinePriceKind(resolved.planCode);
    const cents =
      offered !== null
        ? await this.pricing.ensureRow(kind, offered)
        : ((await this.pricing.amountOf(kind)) ?? 0);
    return {
      row: row as AddonContext['row'],
      priceId: await this.pricing.requirePriceId(kind),
      knownPriceIds: await this.pricing.allHotlinePriceIds(),
      cents,
    };
  }

  /** Like seats: not in a trial, and only after a real payment. */
  private async assertPaidPeriod(row: Subscription): Promise<void> {
    if (row.status === 'trialing') {
      throw new ConflictException({
        code: ErrorCode.SEATS_TRIAL_NOT_ALLOWED,
        message: 'The hotline add-on can be bought after the first payment.',
        details: { trialEndsAt: row.trial_ends_at?.toISOString() ?? null },
      });
    }
    if (!(await this.paidPeriod(row.user_id, row))) {
      throw new ConflictException({
        code: ErrorCode.SEATS_NOT_PAID_YET,
        message: 'The hotline add-on can be bought after the first payment.',
        details: { status: row.status },
      });
    }
  }

  private async paidPeriod(
    userId: string,
    row: Subscription | null,
  ): Promise<boolean> {
    if (row?.status !== 'active') return false;
    const paid = await this.prisma.payment.count({
      where: { user_id: userId, status: 'succeeded', amount_cents: { gt: 0 } },
    });
    return paid > 0;
  }
}
