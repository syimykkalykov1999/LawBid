import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Subscription } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { EntitlementsService } from '../plans/entitlements.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PAYMENT_PROVIDER, SUBSCRIPTION_CURRENCY } from './billing.constants';
import type { SeatChangeResultDto, SeatPreviewDto } from './billing.dto';
import type { PaymentProvider } from './payment-provider';
import { PricingService, seatPriceKind } from './pricing.service';
import { SubscriptionsService } from './subscriptions.service';

/** A preview's proration moment stays valid this long (the sheet is open
 * for a minute or two; an hour-old price is asked again). */
export const SEAT_PREVIEW_TTL_SEC = 60 * 60;

interface SeatContext {
  row: Subscription & { stripe_subscription_id: string };
  /** The plan's included seats. */
  included: number;
  /** How many extra seats the plan / the admin allows. */
  maxExtra: number;
  seatKind: string;
  seatPriceId: string;
  knownSeatPriceIds: string[];
  seatCents: number;
}

/**
 * Owner 2026-10-22 — assistant seats like Slack:
 * 1. Buying a seat charges NOW the prorated rest of the current period
 *    (Stripe `always_invoice` + `pending_if_incomplete` + the preview's
 *    `proration_date`); after that the seat recurs in the monthly invoice.
 *    The seat is written to the subscription only once that invoice is
 *    paid (at once, or after 3-D Secure via the webhook).
 * 2. Removing a seat refunds nothing: Stripe's quantity is lowered at once
 *    with `proration_behavior: none` (so the next monthly invoice is
 *    already right and no credit is made) while `assistant_seats` — what
 *    the attorney may use — keeps the paid count until the period end;
 *    a `scheduled` row in assistant_seat_changes says when it drops. The
 *    renewal webhook (or the next read here) applies it. Simplest robust
 *    way: no timer, no subscription schedule (schedules would also void
 *    pending seat purchases).
 * 3. Seats are bought only after the first PAID period — not during a
 *    trial (SEATS_TRIAL_NOT_ALLOWED) nor before any payment
 *    (SEATS_NOT_PAID_YET).
 */
@Injectable()
export class SeatsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly pricing: PricingService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** POST /subscriptions/seats/preview. */
  async preview(user: RequestUser, seats: number): Promise<SeatPreviewDto> {
    const ctx = await this.context(user);
    await this.applyDueDecrease(user.sub, ctx.row);
    this.assertWithinPlan(ctx, seats);
    const current = ctx.row.assistant_seats;
    const prorationDate = Math.floor(Date.now() / 1000);
    const add = Math.max(0, seats - current);
    const base = {
      seats,
      currentSeats: current,
      currency: SUBSCRIPTION_CURRENCY,
      prorationDate,
      periodEnd: ctx.row.current_period_end?.toISOString() ?? null,
      seatCents: ctx.seatCents,
      monthlyIncreaseCents: (seats - current) * ctx.seatCents,
      nextChargeCents: Math.max(
        0,
        ctx.row.price_cents + (seats - current) * ctx.seatCents,
      ),
    };
    if (add === 0) return { ...base, amountNowCents: 0 };
    await this.assertPaidPeriod(ctx.row);
    const p = await this.provider.previewSeatIncrease({
      subscriptionId: ctx.row.stripe_subscription_id,
      seatPriceId: ctx.seatPriceId,
      knownSeatPriceIds: ctx.knownSeatPriceIds,
      addSeats: add,
      prorationDate,
    });
    return {
      ...base,
      amountNowCents: p.amountNowCents,
      currency: p.currency || SUBSCRIPTION_CURRENCY,
      periodEnd: p.periodEnd
        ? new Date(p.periodEnd * 1000).toISOString()
        : base.periodEnd,
    };
  }

  /** POST /subscriptions/seats: more seats are charged now, fewer seats
   * go at the period end. */
  async set(
    user: RequestUser,
    seats: number,
    prorationDate?: number,
  ): Promise<SeatChangeResultDto> {
    const ctx = await this.context(user);
    await this.applyDueDecrease(user.sub, ctx.row);
    const row = ctx.row;
    this.assertWithinPlan(ctx, seats);
    const paid = row.assistant_seats;
    const scheduled = await this.prisma.assistantSeatChange.findFirst({
      where: { user_id: user.sub, status: 'scheduled' },
      orderBy: { created_at: 'desc' },
    });

    if (seats < paid || (seats === paid && scheduled)) {
      return this.decrease(user, ctx, seats, scheduled);
    }
    if (seats === paid) return this.result(user, 'applied');

    // --- more seats: paid now ---------------------------------------------
    await this.assertPaidPeriod(row);
    const now = Math.floor(Date.now() / 1000);
    const at = prorationDate ?? now;
    if (at > now + 60 || now - at > SEAT_PREVIEW_TTL_SEC) {
      throw new ConflictException({
        code: ErrorCode.SEATS_PREVIEW_STALE,
        message: 'The price is out of date — check it again.',
      });
    }
    if (scheduled) {
      // A removal was waiting for the period end: the seats it would drop
      // are paid already, so Stripe gets them back free before the charge
      // (the charge then covers only seats above the paid count).
      await this.provider.setSeatQuantity(
        row.stripe_subscription_id,
        ctx.seatPriceId,
        paid,
        ctx.knownSeatPriceIds,
        'none',
      );
      await this.prisma.assistantSeatChange.update({
        where: { id: scheduled.id },
        data: { status: 'canceled' },
      });
    }
    const charge = await this.provider.chargeSeatIncrease({
      subscriptionId: row.stripe_subscription_id,
      seatPriceId: ctx.seatPriceId,
      knownSeatPriceIds: ctx.knownSeatPriceIds,
      quantity: seats,
      prorationDate: at,
      idempotencyKey: `seats:${user.sub}:${paid}-${seats}:${at}`,
    });
    const change = await this.prisma.assistantSeatChange.create({
      data: {
        user_id: user.sub,
        from_seats: paid,
        to_seats: seats,
        stripe_invoice_id: charge.invoiceId,
        amount_cents: charge.amountCents,
        currency: charge.currency || SUBSCRIPTION_CURRENCY,
        status:
          charge.status === 'applied'
            ? 'paid'
            : charge.status === 'failed'
              ? 'failed'
              : 'pending',
      },
    });
    if (charge.status === 'applied') {
      // Paid: the seats are usable now; the webhook re-reads the same.
      await this.prisma.subscription.update({
        where: { id: row.id },
        data: {
          assistant_seats: seats,
          price_cents: row.price_cents + (seats - paid) * ctx.seatCents,
        },
      });
      await this.entitlements.invalidateUser(user.sub);
    }
    return this.result(user, charge.status, {
      clientSecret: charge.clientSecret,
      amountCents: charge.amountCents,
      currency: charge.currency,
      changeId: change.id,
    });
  }

  /** Fewer seats: free, from the period end (owner rule 2). */
  private async decrease(
    user: RequestUser,
    ctx: SeatContext,
    seats: number,
    scheduled: { id: string } | null,
  ): Promise<SeatChangeResultDto> {
    const row = ctx.row;
    const live = await this.prisma.assistantMembership.count({
      where: { attorney_id: user.sub, status: { not: 'removed' } },
    });
    if (ctx.included + seats < live) {
      throw new ConflictException({
        code: ErrorCode.ASSISTANT_SEATS_IN_USE,
        message: 'Remove assistants before lowering the number of seats.',
        details: { inUse: live },
      });
    }
    await this.provider.setSeatQuantity(
      row.stripe_subscription_id,
      ctx.seatPriceId,
      seats,
      ctx.knownSeatPriceIds,
      'none',
    );
    if (seats === row.assistant_seats) {
      // Back to what is paid: the waiting removal is called off.
      if (scheduled) {
        await this.prisma.assistantSeatChange.update({
          where: { id: scheduled.id },
          data: { status: 'canceled' },
        });
      }
      return this.result(user, 'applied');
    }
    const effectiveAt = row.current_period_end ?? new Date();
    const change = scheduled
      ? await this.prisma.assistantSeatChange.update({
          where: { id: scheduled.id },
          data: { to_seats: seats, effective_at: effectiveAt },
        })
      : await this.prisma.assistantSeatChange.create({
          data: {
            user_id: user.sub,
            from_seats: row.assistant_seats,
            to_seats: seats,
            status: 'scheduled',
            effective_at: effectiveAt,
          },
        });
    return this.result(user, 'scheduled', {
      effectiveAt: effectiveAt.toISOString(),
      changeId: change.id,
    });
  }

  /**
   * A removal whose period has ended: the seats drop now. The renewal
   * webhook normally does it (SubscriptionSyncService); this covers a
   * late or missed one, so the attorney never keeps an unpaid seat.
   */
  async applyDueDecrease(userId: string, row?: Subscription): Promise<void> {
    const due = await this.prisma.assistantSeatChange.findFirst({
      where: {
        user_id: userId,
        status: 'scheduled',
        effective_at: { lte: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });
    if (!due) return;
    const sub =
      row ??
      (await this.prisma.subscription.findUnique({
        where: { user_id: userId },
      }));
    if (!sub) return;
    const seatCents = await this.seatCentsFor(userId);
    const to = Math.min(sub.assistant_seats, due.to_seats);
    const priceCents = Math.max(
      0,
      sub.price_cents - (sub.assistant_seats - to) * seatCents,
    );
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: sub.id },
        data: { assistant_seats: to, price_cents: priceCents },
      }),
      this.prisma.assistantSeatChange.update({
        where: { id: due.id },
        data: { status: 'applied' },
      }),
    ]);
    if (row) {
      row.assistant_seats = to;
      row.price_cents = priceCents;
    }
    await this.entitlements.invalidateUser(userId);
  }

  /**
   * Owner 2026-10-22: a card saved on our card page (or Apple Pay / Google
   * Pay) becomes the subscription's card before the seats are charged to
   * it. The SetupIntent must be this attorney's and succeeded.
   */
  async useCard(user: RequestUser, setupIntentId: string): Promise<void> {
    const ctx = await this.context(user);
    const si = await this.provider.retrieveSetupIntent(setupIntentId);
    const customer = await this.subscriptions.customerId(user.sub, null);
    if (
      !si ||
      si.status !== 'succeeded' ||
      !si.paymentMethodId ||
      si.customerId !== customer
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The card was not saved. Try again.',
      });
    }
    await this.provider.setSubscriptionPaymentMethod?.(
      ctx.row.stripe_subscription_id,
      si.paymentMethodId,
    );
  }

  // --- helpers -------------------------------------------------------------

  private async result(
    user: RequestUser,
    status: SeatChangeResultDto['status'],
    extra: Partial<Omit<SeatChangeResultDto, 'status' | 'overview'>> = {},
  ): Promise<SeatChangeResultDto> {
    return {
      status,
      clientSecret: extra.clientSecret ?? null,
      amountCents: extra.amountCents ?? 0,
      currency: extra.currency || SUBSCRIPTION_CURRENCY,
      effectiveAt: extra.effectiveAt ?? null,
      changeId: extra.changeId ?? null,
      overview: await this.subscriptions.me(user),
    };
  }

  private async context(user: RequestUser): Promise<SeatContext> {
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
    // Owner 2026-10-05 (plan builder): seats = extra on top of the plan's
    // included ones; the plan says how many may be bought.
    const current = await this.entitlements.forUser(user.sub);
    const mine = current.seats ?? { included: 0, extra: 0, total: 0, max: 0 };
    const seatKind =
      typeof current.values.extra_seat_price_cents === 'number' &&
      current.planCode
        ? seatPriceKind(current.planCode)
        : 'seat';
    return {
      row: row as SeatContext['row'],
      included: mine.included,
      maxExtra: Math.max(0, mine.max - mine.included),
      seatKind,
      seatPriceId: await this.pricing.requirePriceId(seatKind),
      knownSeatPriceIds: [
        ...(await this.pricing.knownPriceIds(seatKind)),
        ...(seatKind === 'seat'
          ? []
          : await this.pricing.knownPriceIds('seat')),
      ],
      seatCents:
        (await this.pricing.amountOf(seatKind)) ??
        (await this.pricing.amount('seat')),
    };
  }

  private assertWithinPlan(ctx: SeatContext, seats: number): void {
    if (ctx.maxExtra === 0) {
      throw new ConflictException({
        code: ErrorCode.SUBSCRIPTION_PLAN_INCLUDES_SEATS,
        message: `Your plan already includes ${ctx.included} assistants; no extra seats can be added.`,
        details: { included: ctx.included },
      });
    }
    if (seats > ctx.maxExtra) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Your plan does not allow that many extra assistants.',
        details: { field: 'seats', max: ctx.maxExtra },
      });
    }
  }

  /** Owner rule 3: not in a trial, and only after a real payment. */
  private async assertPaidPeriod(row: Subscription): Promise<void> {
    if (row.status === 'trialing') {
      throw new ConflictException({
        code: ErrorCode.SEATS_TRIAL_NOT_ALLOWED,
        message: 'Assistant seats can be bought after the first payment.',
        details: { trialEndsAt: row.trial_ends_at?.toISOString() ?? null },
      });
    }
    const paid =
      row.status === 'active'
        ? await this.prisma.payment.count({
            where: {
              user_id: row.user_id,
              status: 'succeeded',
              amount_cents: { gt: 0 },
            },
          })
        : 0;
    if (paid === 0) {
      throw new ConflictException({
        code: ErrorCode.SEATS_NOT_PAID_YET,
        message: 'Assistant seats can be bought after the first payment.',
        details: { status: row.status },
      });
    }
  }

  private async seatCentsFor(userId: string): Promise<number> {
    const current = await this.entitlements.forUser(userId);
    const kind =
      typeof current.values.extra_seat_price_cents === 'number' &&
      current.planCode
        ? seatPriceKind(current.planCode)
        : 'seat';
    return (
      (await this.pricing.amountOf(kind)) ?? (await this.pricing.amount('seat'))
    );
  }
}
