import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { BidPacksService } from '../bid-packs/bid-packs.service';
import { ClientBadgeService } from '../client-badge/client-badge.service';
import { ClientPlansService } from '../plans/client-plans.service';
import { PromotionsService } from '../promotions/promotions.service';
import { StarsService } from '../stars/stars.service';
import { PAYMENT_PROVIDER } from './billing.constants';
import type { CheckoutRequestDto, SubscriptionMeDto } from './billing.dto';
import {
  type PayKind,
  PayLinkService,
  type PayPayload,
  payKindOf,
} from './pay-link.service';
import {
  PI_TAX_CALCULATION_KEY,
  PI_TAX_CENTS_KEY,
  type PaymentProvider,
  type ProviderTaxAddress,
} from './payment-provider';
import { SeatsService } from './seats.service';
import {
  OWN_PAGE_SESSION_PREFIX,
  SubscriptionsService,
} from './subscriptions.service';

/** What the card page draws and how it pays. */
export interface PayPageSession {
  kind: PayKind;
  /** setup = save a card (SetupIntent); payment = pay now (PaymentIntent);
   * none = nothing left to pay (already paid). */
  mode: 'setup' | 'payment' | 'none';
  /** The page's own token for the next calls (the link is one-time). */
  pageToken: string;
  publishableKey: string;
  clientSecret: string | null;
  /** subscription: the SetupIntent the card is saved on. */
  setupIntentId?: string;
  /** What the card is charged (one-time: incl. tax when Stripe Tax is on). */
  priceCents: number;
  /** Owner 2026-10-22 (Stripe Tax): the tax inside priceCents; null when
   * no tax applies / could not be placed yet (send `address` to place). */
  taxCents?: number | null;
  /** The pre-tax amount the page may show as the line price. */
  subtotalCents?: number;
  currency: string;
  /** subscription */
  trialDays?: number;
  trialEligible?: boolean;
  /** seats: the count wanted / paid now, the monthly total after it. */
  seats?: number;
  currentSeats?: number;
  nextChargeCents?: number;
  periodEnd?: string | null;
  prorationDate?: number;
  /** promotion */
  days?: number;
  target?: 'case' | 'post';
  /** stars / bid_pack: what the purchase gives. */
  stars?: number;
  bids?: number;
  /** Where «Return to LawBid» lands (`/<kind>/success|cancel`, the app's
   * payment-return links). */
  returnPath: string;
}

/** The return links the app already routes (core/deeplinks). */
const RETURN_PATHS: Record<PayKind, string> = {
  subscription: '/subscription',
  seats: '/subscription',
  promotion: '/promotion',
  stars: '/stars',
  bid_pack: '/bid-packs',
  client_plan: '/plan',
  client_badge: '/verification',
};

/** The card page's result after its payment step. */
export interface PayPageResult {
  /** ok = done; requires_action = confirm the bank check (3-D Secure) with
   * [clientSecret]; failed = declined, try another card; pending = the
   * payment is still processing (the webhook finishes it). */
  status: 'ok' | 'requires_action' | 'failed' | 'pending';
  clientSecret?: string | null;
  message?: string;
  /** subscription: the state after (as before 2026-10-22). */
  subscription?: SubscriptionMeDto;
}

export interface PayConfirmInput {
  setupIntentId?: string;
  chargeNow?: boolean;
  prorationDate?: number;
}

/**
 * Owner 2026-10-16: our own card page (variant B). Owner 2026-10-22 (audit
 * #3): it now sells everything paid — the subscription, assistant seats and
 * Boost — with card fields, Apple Pay and Google Pay, so no store build ever
 * shows a payment screen and nobody lands on Stripe's hosted page. The link
 * is signed and one-time (PayLinkService); the page never gets an access
 * token, only the right to pay for that one order.
 */
@Injectable()
export class PayPageService {
  constructor(
    private readonly links: PayLinkService,
    private readonly subscriptions: SubscriptionsService,
    private readonly prisma: PrismaService,
    @Optional() private readonly seats?: SeatsService,
    @Optional() private readonly promotions?: PromotionsService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    // Owner 2026-10-22 («лечи всё»): every other purchase too.
    @Optional() private readonly stars?: StarsService,
    @Optional() private readonly bidPacks?: BidPacksService,
    @Optional() private readonly clientPlans?: ClientPlansService,
    @Optional() private readonly clientBadge?: ClientBadgeService,
  ) {}

  /** The public Stripe key (admin card or the env). */
  publishableKey(): Promise<string | null> {
    return this.links.publishableKey();
  }

  enabled(): Promise<boolean> {
    return this.links.enabled();
  }

  /** The subscription's link (the app's `/subscriptions/checkout`). */
  async link(
    user: RequestUser,
    req: CheckoutRequestDto,
    apiBase: string,
  ): Promise<{ url: string; id: string }> {
    const l = await this.links.link(
      user.sub,
      { kind: 'subscription', order: req },
      apiBase,
    );
    return { url: l.url, id: `${OWN_PAGE_SESSION_PREFIX}${l.id}` };
  }

  /** Owner 2026-10-22: the seat purchase's link (iPhone: no in-app sheet). */
  async seatsLink(
    user: RequestUser,
    seats: number,
    apiBase: string,
  ): Promise<{ url: string; id: string }> {
    // The same checks as the in-app purchase, before the browser opens.
    await this.seatsService().preview(user, seats);
    const l = await this.links.link(
      user.sub,
      { kind: 'seats', seats },
      apiBase,
    );
    return { url: l.url, id: l.id };
  }

  /**
   * Owner 2026-10-22 (Stripe Tax): the page's answer with the tax, when
   * the admin switch is on. One-time kinds get a Tax calculation for the
   * amount at the buyer's address / IP and the PaymentIntent is raised to
   * the total; card-saving kinds get the address stored on the customer so
   * the subscription (created at confirm) can carry `automatic_tax`.
   */
  async session(
    token: string,
    where: { ip?: string | null; address?: ProviderTaxAddress | null } = {},
  ): Promise<PayPageSession> {
    const { session: s, payload } = await this.baseSession(token);
    const taxOn = await this.subscriptions.stripeTaxEnabled();
    if (!taxOn || !this.provider) return s;
    const location = { ip: where.ip ?? null, address: where.address ?? null };
    try {
      if (
        s.mode === 'payment' &&
        s.clientSecret &&
        this.provider.calculateTax
      ) {
        const piId = s.clientSecret.split('_secret')[0];
        const current = await this.provider.retrievePaymentIntent?.(piId);
        const subtotal = s.priceCents;
        const calc = await this.provider.calculateTax({
          amountCents: subtotal,
          currency: s.currency,
          reference: piId,
          location,
        });
        if (
          current &&
          (current.amountCents !== calc.totalCents ||
            current.metadata[PI_TAX_CALCULATION_KEY] !== calc.calculationId)
        ) {
          await this.provider.updatePaymentIntent?.(piId, {
            amountCents: calc.totalCents,
            metadata: {
              ...current.metadata,
              [PI_TAX_CALCULATION_KEY]: calc.calculationId,
              [PI_TAX_CENTS_KEY]: String(calc.taxCents),
            },
          });
        }
        return {
          ...s,
          priceCents: calc.totalCents,
          subtotalCents: subtotal,
          taxCents: calc.taxCents,
        };
      }
      if (s.mode === 'setup' && (location.ip || location.address)) {
        const user = await this.userOf(payload, 'any');
        const customerId = await this.subscriptions.customerId(user.sub, null);
        await this.provider.updateCustomerTaxLocation?.(customerId, location);
      }
    } catch {
      // Tax is best effort on the page: Stripe adds it on the invoice when
      // the customer could be placed; the page shows the listed price.
    }
    return s;
  }

  private async baseSession(
    token: string,
  ): Promise<{ session: PayPageSession; payload: PayPayload }> {
    const { payload: p, page } = await this.links.open(token);
    return { session: await this.sessionOf(p, page), payload: p };
  }

  private async sessionOf(
    p: PayPayload,
    page: string,
  ): Promise<PayPageSession> {
    const key = await this.links.publishableKey();
    if (!key) {
      throw new BadRequestException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'The card page is not configured.',
      });
    }
    const kind = payKindOf(p);
    const common = {
      kind,
      pageToken: page,
      publishableKey: key,
      returnPath: RETURN_PATHS[kind],
    };

    if (kind === 'stars' || kind === 'bid_pack') {
      const buyer = (await this.userOf(p, 'any')).sub;
      const s =
        kind === 'stars'
          ? await need(this.stars).payPageSession(buyer, p.p ?? '')
          : await need(this.bidPacks).payPageSession(buyer, p.p ?? '');
      return {
        ...common,
        mode: s.paid ? 'none' : 'payment',
        clientSecret: s.clientSecret,
        priceCents: s.amountCents,
        currency: 'usd',
        ...('stars' in s ? { stars: s.stars } : { bids: s.bids }),
      };
    }

    if (kind === 'client_plan' || kind === 'client_badge') {
      const client = await this.userOf(p, 'client');
      const s =
        kind === 'client_plan'
          ? await need(this.clientPlans).payPageSession(client, p.p)
          : {
              ...(await need(this.clientBadge).payPageSession(client.sub)),
              trialDays: 0,
            };
      return {
        ...common,
        mode: 'setup',
        clientSecret: s.clientSecret,
        setupIntentId: s.setupIntentId,
        priceCents: s.priceCents,
        currency: 'usd',
        trialDays: s.trialDays,
        trialEligible: s.trialDays > 0,
      };
    }

    if (kind === 'promotion') {
      const s = await this.promotionsService().payPageSession(
        (await this.userOf(p, 'any')).sub,
        p.p ?? '',
      );
      return {
        ...common,
        mode: s.paid ? 'none' : 'payment',
        clientSecret: s.clientSecret,
        priceCents: s.amountCents,
        currency: s.currency,
        days: s.days,
        target: s.target,
      };
    }

    const user = await this.userOf(p, 'attorney');
    if (kind === 'seats') {
      const preview = await this.seatsService().preview(user, p.s ?? 0);
      // A new card (or a wallet) can be used instead of the saved one.
      const customerId = await this.subscriptions.customerId(user.sub, null);
      const si = await this.requireProvider().createSetupIntent(customerId, {
        userId: user.sub,
        kind: 'assistant_seats',
      });
      return {
        ...common,
        mode: 'setup',
        clientSecret: si.clientSecret,
        setupIntentId: si.id,
        priceCents: preview.amountNowCents,
        taxCents: this.seatTax(preview),
        currency: preview.currency,
        seats: preview.seats,
        currentSeats: preview.currentSeats,
        nextChargeCents: preview.nextChargeCents,
        periodEnd: preview.periodEnd,
        prorationDate: preview.prorationDate,
      };
    }

    const started = await this.subscriptions.start(user, p.r ?? {});
    return {
      ...common,
      mode: 'setup',
      clientSecret: started.clientSecret,
      setupIntentId: started.setupIntentId,
      priceCents: started.priceCents,
      currency: 'usd',
      trialDays: started.trialDays,
      trialEligible: started.trialEligible,
    };
  }

  /** seats: the preview already carries the tax (SeatPreviewDto). */
  private seatTax(preview: { taxCents?: number | null }): number | null {
    return preview.taxCents ?? null;
  }

  async confirm(token: string, input: PayConfirmInput): Promise<PayPageResult> {
    const p = this.links.verify(token);
    const kind = payKindOf(p);

    if (kind === 'stars' || kind === 'bid_pack') {
      const buyer = (await this.userOf(p, 'any')).sub;
      const paid =
        kind === 'stars'
          ? await need(this.stars).payPageConfirm(buyer, p.p ?? '')
          : await need(this.bidPacks).payPageConfirm(buyer, p.p ?? '');
      return { status: paid ? 'ok' : 'pending', clientSecret: null };
    }

    if (kind === 'client_plan' || kind === 'client_badge') {
      if (!input.setupIntentId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'The card was not saved. Try again.',
        });
      }
      const client = await this.userOf(p, 'client');
      const on =
        kind === 'client_plan'
          ? await need(this.clientPlans).payPageConfirm(
              client,
              p.p,
              input.setupIntentId,
            )
          : await need(this.clientBadge).payPageConfirm(
              client.sub,
              input.setupIntentId,
            );
      return { status: on ? 'ok' : 'pending', clientSecret: null };
    }

    if (kind === 'promotion') {
      const user = await this.userOf(p, 'any');
      const paid = await this.promotionsService().payPageConfirm(
        user.sub,
        p.p ?? '',
      );
      // Not seen as paid yet (the card still processing): the webhook
      // finishes it; the page tells the buyer it is on its way.
      return { status: paid ? 'ok' : 'pending', clientSecret: null };
    }

    const user = await this.userOf(p, 'attorney');
    if (kind === 'seats') {
      const seats = this.seatsService();
      if (input.setupIntentId) await seats.useCard(user, input.setupIntentId);
      const r = await seats.set(user, p.s ?? 0, input.prorationDate);
      return {
        status:
          r.status === 'requires_action'
            ? 'requires_action'
            : r.status === 'failed'
              ? 'failed'
              : 'ok',
        clientSecret: r.clientSecret,
      };
    }

    if (!input.setupIntentId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The card was not saved. Try again.',
      });
    }
    const subscription = await this.subscriptions.confirm(
      user,
      input.setupIntentId,
      input.chargeNow === true,
    );
    return { status: 'ok', subscription };
  }

  /** The buyer the token names, as a request user (no session: the card
   * page never gets an access token). */
  private async userOf(
    p: PayPayload,
    role: 'attorney' | 'client' | 'any',
  ): Promise<RequestUser> {
    const u = await this.prisma.user.findUnique({
      where: { id: p.u },
      select: { role: true, status: true },
    });
    if (!u || u.status !== 'active' || (role !== 'any' && u.role !== role)) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'This link is not valid.',
      });
    }
    return {
      sub: p.u,
      role: u.role as RequestUser['role'],
      sid: 'pay-page',
      verified: true,
      subscriptionStatus: 'none',
    };
  }

  private seatsService(): SeatsService {
    if (!this.seats) throw new Error('SeatsService is not wired');
    return this.seats;
  }

  private promotionsService(): PromotionsService {
    if (!this.promotions) throw new Error('PromotionsService is not wired');
    return this.promotions;
  }

  private requireProvider(): PaymentProvider {
    if (!this.provider) throw new Error('PAYMENT_PROVIDER is not wired');
    return this.provider;
  }
}

/** A seller service that must be wired for this kind of purchase. */
function need<T>(svc: T | undefined): T {
  if (!svc) throw new Error('The pay page is not wired for this purchase');
  return svc;
}
