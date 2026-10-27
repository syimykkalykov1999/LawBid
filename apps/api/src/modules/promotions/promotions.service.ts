import { AttorneyAdsService } from '../attorney-ads/attorney-ads.service';
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
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { CasePromotion, Prisma } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
} from '../../common/pagination/cursor.util';
import { CounterAggregator } from '../counters/counter-aggregator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { EntitlementsService } from '../plans/entitlements.service';
import { LedgerPostingService } from '../ledger/ledger.public';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import {
  isPaymentIntentId,
  paymentIntentAsCheckout,
  type PaymentProvider,
  type ProviderCheckoutSession,
} from '../billing/payment-provider';
import { PayLinkService } from '../billing/pay-link.service';
import { StarsService } from '../stars/stars.service';
import { ReferralsService } from '../referrals/referrals.service';
import { wholeDays } from '../referrals/referrals.settings';
import type {
  CasePromotionDto,
  CasePromotionStateDto,
  CreatePromotionDto,
  CreatePromotionResultDto,
  MyPromotionDto,
  PromotionQuoteDto,
  PromotionStatsDto,
} from './promotions.dto';
import { PromotionDeliveryService } from './promotion-delivery.service';
import { PromotionRefundsService } from './promotion-refunds.service';
import {
  billingOf,
  deliveredUnits,
  isAllowedAdLink,
  offersFor,
  parseAudience,
  parsePromotionSettings,
  PENDING_PAYMENT_TTL_MS,
  pricingTargetOf,
  PROMOTION_SETTINGS_KEY,
  quotePromotion,
  reachRange,
  targetUnits,
  unitsFor,
  type BillingModel,
  type PromoDiscount,
  type PromotionSettings,
  type PromotionStatus,
  type PromotionTarget,
} from './promotions.settings';

const DAY_MS = 86_400_000;
export const PROMOTION_CHECKOUT_KIND = 'case_promotion';
/** System cancellations a late payment may still revive. */
const REVIVABLE_REASONS = ['checkout_expired', 'superseded'];

type Db = Prisma.TransactionClient | PrismaService;

export function toPromotionDto(p: CasePromotion): CasePromotionDto {
  return {
    id: p.id,
    targetType: p.target_type === 'post' ? 'post' : 'case',
    caseId: p.case_id,
    postId: p.post_id,
    status: p.status as PromotionStatus,
    days: p.days,
    priceCentsPerDay: p.price_cents_per_day,
    totalCents: p.total_cents,
    startsAt: p.starts_at?.toISOString() ?? null,
    endsAt: p.ends_at?.toISOString() ?? null,
    impressions: p.impressions,
    reach: p.reach,
    clicks: p.clicks,
    targetImpressions: p.target_impressions,
    billing: billingOf(p.billing),
    unitPriceCents: p.unit_price_cents,
    targetUnits: targetUnits(p),
    deliveredUnits: deliveredUnits(p),
    actions: p.actions,
    refundedCents: p.refunded_cents,
    audience: p.audience ? parseAudience(p.audience) : null,
    cancelReason: p.cancel_reason,
    goal: p.goal,
    ctaType: p.cta_type,
    ctaValue: p.cta_value,
    paidStars: p.paid_stars,
    createdAt: p.created_at.toISOString(),
  };
}

function postNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.POST_NOT_FOUND,
    message: 'Post not found.',
  });
}

/** What a promotion points at, owned by the buyer. */
interface OwnedTarget {
  type: PromotionTarget;
  id: string;
  /** May be promoted right now (open case / published post). */
  promotable: boolean;
  /** A video post (a reel). */
  video: boolean;
}

function caseNotFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.CASE_NOT_FOUND,
    message: 'Case not found.',
  });
}

function alreadyActive(): ConflictException {
  return new ConflictException({
    code: ErrorCode.PROMOTION_ALREADY_ACTIVE,
    message: 'This is already promoted.',
  });
}

const targetWhere = (t: OwnedTarget) =>
  t.type === 'post' ? { post_id: t.id } : { case_id: t.id };

/**
 * Owner 2026-10-02: paid case promotion (~$10/day). Owner 2026-10-05:
 * Instagram-style — posts too, for clients and attorneys, no subscription
 * needed (admin switch `requireSubscription`, off). The owner picks a
 * daily budget and days and sees "about N people"; the budget buys
 * target_impressions at the admin's CPM. One-time hosted checkout (or
 * referral credit days / a 100 % promo code); the webhook
 * (`checkout.session.completed`, metadata kind=case_promotion) activates
 * it after the automatic content check (else `pending_review` for staff).
 * PromotionDeliveryService shows it in the feeds and counts reach;
 * `promotions.expire` finishes it when the time is over.
 */
@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly referrals: ReferralsService,
    @Optional()
    @Inject(PAYMENT_PROVIDER)
    private readonly provider?: PaymentProvider,
    @Optional() private readonly notifications?: NotificationsService,
    // Owner 2026-10-05 (plan builder): promotion is a client plan term.
    @Optional() private readonly entitlements?: EntitlementsService,
    @Optional() private readonly delivery?: PromotionDeliveryService,
    @Optional() private readonly appSettings?: AppSettingsService,
    @Optional() private readonly stars?: StarsService,
    // Owner 2026-10-22: our own card page in place of Stripe's.
    @Optional() private readonly payLink?: PayLinkService,
    // Owner 2026-10-28: a copy of every attorney promotion (ad archive).
    @Optional() private readonly ads?: AttorneyAdsService,
    // Day-one foundations: the double-entry money ledger (same transaction).
    @Optional() private readonly ledger?: LedgerPostingService,
    // Owner 2026-10-25: impressions / reach / clicks wait in the counter
    // aggregator until the next flush; stats add them so the answer is exact.
    @Optional() private readonly counters?: CounterAggregator,
    // Owner 2026-10-27: the unspent part of a boost paid per result goes back.
    @Optional() private readonly unspent?: PromotionRefundsService,
  ) {}

  /** Owner 2026-10-28: the promoted post of an attorney is paid
   * advertising — keep the exact text that was promoted. Never throws. */
  private async archivePromotion(
    userId: string,
    promotionId: string,
    postId: string,
  ): Promise<void> {
    if (!this.ads) return;
    try {
      const [user, post] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        }),
        this.prisma.post.findUnique({
          where: { id: postId },
          select: { title: true, body: true },
        }),
      ]);
      if (user?.role !== 'attorney' || !post) return;
      await this.ads.archive(
        userId,
        'promotion',
        promotionId,
        post.title ? `${post.title}\n${post.body}` : post.body,
      );
    } catch {
      // The archive never blocks a purchase.
    }
  }

  /** Rows with the not yet flushed impressions / reach / clicks / actions added. */
  private async withPending<T extends CasePromotion>(rows: T[]): Promise<T[]> {
    if (!this.counters || rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const [imp, reach, clicks, actions] = await Promise.all([
      this.counters.pending('case_promotion', 'impressions', ids),
      this.counters.pending('case_promotion', 'reach', ids),
      this.counters.pending('case_promotion', 'clicks', ids),
      this.counters.pending('case_promotion', 'actions', ids),
    ]);
    return rows.map((r) => ({
      ...r,
      impressions: r.impressions + (imp.get(r.id) ?? 0),
      reach: r.reach + (reach.get(r.id) ?? 0),
      clicks: r.clicks + (clicks.get(r.id) ?? 0),
      actions: r.actions + (actions.get(r.id) ?? 0),
    }));
  }

  /** Owner 2026-10-16: an attorney who is not verified cannot buy Boost
   * (clients are not affected; rollback `billing.require_verified_for_purchases`). */
  private async assertVerified(userId: string): Promise<void> {
    if (!this.appSettings) return;
    if (
      !(await this.appSettings.boolean(
        'billing.require_verified_for_purchases',
      ))
    ) {
      return;
    }
    const p = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: userId },
      select: { verification_status: true },
    });
    if (p && p.verification_status !== 'verified') {
      throw new ForbiddenException({
        code: ErrorCode.ATTORNEY_NOT_VERIFIED,
        message: 'Boost is available after verification.',
      });
    }
  }

  /** Only when the admin turned "needs a subscription" on. */
  private async assertEntitled(
    userId: string,
    settings: PromotionSettings,
  ): Promise<void> {
    if (
      settings.requireSubscription &&
      this.entitlements &&
      !(await this.entitlements.has(userId, 'case_promotion'))
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ENTITLEMENT_REQUIRED,
        message: 'Your plan does not include promotion.',
      });
    }
  }

  /** Owner 2026-10-15: the switches — master, role, content type. */
  private async boostAllowed(
    userId: string,
    type: PromotionTarget,
    video: boolean,
    settings: PromotionSettings,
  ): Promise<boolean> {
    if (!settings.boostEnabled) return false;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (u?.role === 'attorney' && !settings.attorneysEnabled) return false;
    if (u?.role === 'client' && !settings.clientsEnabled) return false;
    // Owner 2026-10-27: a thing with every way to pay switched off cannot
    // be boosted.
    if (
      offersFor(settings.pricing, pricingTargetOf(type, video)).length === 0
    ) {
      return false;
    }
    if (type === 'case') return settings.enabled;
    return video ? settings.reelsEnabled : settings.postsEnabled;
  }

  /**
   * Owner 2026-10-27: which way to pay a purchase uses. The buyer's choice
   * when it is switched on; otherwise the first one on (the app does not send
   * a choice yet, so the owner's switches decide). Null = none is on.
   */
  private pick(
    settings: PromotionSettings,
    type: PromotionTarget,
    video: boolean,
    asked?: BillingModel,
  ): {
    billing: BillingModel;
    priceCents: number;
    actions: string[];
    offers: { billing: BillingModel; priceCents: number }[];
  } | null {
    const t = pricingTargetOf(type, video);
    const offers = offersFor(settings.pricing, t);
    const chosen = offers.find((o) => o.billing === asked) ?? offers[0];
    if (!chosen) return null;
    return {
      ...chosen,
      actions:
        chosen.billing === 'actions' ? [...settings.pricing[t].actions] : [],
      offers,
    };
  }

  async settings(db: Db = this.prisma): Promise<PromotionSettings> {
    const row = await db.appConfig.findUnique({
      where: { key: PROMOTION_SETTINGS_KEY },
    });
    return parsePromotionSettings(row?.value);
  }

  // ---- app --------------------------------------------------------------

  /** GET /promotions/quote?days=&dailyBudgetCents=&target= */
  async quote(
    userId: string,
    days: number,
    dailyBudgetCents?: number,
    target: PromotionTarget = 'case',
    video = false,
    asked?: BillingModel,
  ): Promise<PromotionQuoteDto> {
    const settings = await this.settings();
    await this.assertEntitled(userId, settings);
    this.assertDays(days, settings);
    const daily = this.dailyBudget(dailyBudgetCents, settings);
    const creditDaysAvailable =
      await this.referrals.promotionCreditDays(userId);
    const q = quotePromotion({
      days,
      priceCentsPerDay: daily,
      creditDaysAvailable,
      useCredits: true,
      creditDayValueCents: settings.priceCentsPerDay,
    });
    const model = this.pick(settings, target, video, asked);
    const views =
      settings.pricing[pricingTargetOf(target, video)].models.impressions
        .priceCents;
    // The estimate is in people. Views / people are paid in exactly that
    // unit; for taps and actions it is what the same budget shows at the
    // views price (an upper bound: nobody is charged for it).
    const units = model
      ? unitsFor(model.billing, q.grossCents, model.priceCents)
      : 0;
    const perPerson = settings.impressionsPerPerson;
    const estImpressions =
      model?.billing === 'reach'
        ? Math.round(units * perPerson)
        : model?.billing === 'impressions'
          ? units
          : unitsFor('impressions', q.grossCents, views);
    const reach =
      model?.billing === 'reach'
        ? { min: units, max: units }
        : reachRange(estImpressions, perPerson);
    return {
      days,
      priceCentsPerDay: q.priceCentsPerDay,
      grossCents: q.grossCents,
      totalCents: q.totalCents,
      starsTotal: (await this.stars?.starsForCents(q.totalCents)) ?? null,
      creditDaysAvailable: wholeDays(creditDaysAvailable),
      creditDaysUsed: wholeDays(q.creditDaysUsed),
      creditDaysAvailableExact: creditDaysAvailable,
      creditDaysUsedExact: q.creditDaysUsed,
      maxDays: settings.maxDays,
      enabled: await this.boostAllowed(userId, target, video, settings),
      dailyBudgetCents: daily,
      minDailyBudgetCents: settings.minDailyBudgetCents,
      maxDailyBudgetCents: settings.maxDailyBudgetCents,
      budgetPresetsCents: settings.budgetPresetsCents,
      durationPresets: settings.durationPresets,
      cpmCents: views,
      estImpressions,
      estReachMin: reach.min,
      estReachMax: reach.max,
      postsEnabled: settings.postsEnabled,
      casesEnabled: settings.enabled,
      ctaTypes: settings.ctaEnabled ? settings.ctaTypes : [],
      billing: model?.billing ?? 'impressions',
      unitPriceCents: model?.priceCents ?? views,
      estUnits: units,
      offers: model?.offers ?? [],
      actions: model?.actions ?? [],
    };
  }

  /** GET /cases/:id/promotion — the owner's view (+ a 1-day quote). */
  caseState(userId: string, caseId: string): Promise<CasePromotionStateDto> {
    return this.targetState(userId, 'case', caseId);
  }

  /** GET /posts/:id/promotion — the author's view. */
  postState(userId: string, postId: string): Promise<CasePromotionStateDto> {
    return this.targetState(userId, 'post', postId);
  }

  private async targetState(
    userId: string,
    type: PromotionTarget,
    id: string,
  ): Promise<CasePromotionStateDto> {
    const target = await this.ownedTarget(userId, type, id);
    let rows = await this.recent(target);
    const pending = rows.find(
      (r) => r.status === 'pending_payment' && r.stripe_checkout_id,
    );
    if (pending?.stripe_checkout_id) {
      // Back from the browser before the webhook: check the session.
      if (await this.applyCheckoutById(pending.stripe_checkout_id)) {
        rows = await this.recent(target);
      }
    }
    const now = Date.now();
    const active = rows.find(
      (r) =>
        (r.status === 'active' && (r.ends_at?.getTime() ?? 0) > now) ||
        r.status === 'pending_review',
    );
    const shown =
      active ?? rows.find((r) => r.status === 'pending_payment') ?? rows[0];
    const quote = await this.quote(userId, 1, undefined, type, target.video);
    return {
      promotion: shown ? toPromotionDto(shown) : null,
      canPromote: quote.enabled && target.promotable && !active,
      quote,
    };
  }

  /** POST /cases/:id/promotions. */
  create(
    userId: string,
    caseId: string,
    dto: CreatePromotionDto,
    apiBase?: string,
  ): Promise<CreatePromotionResultDto> {
    return this.createFor(userId, 'case', caseId, dto, apiBase);
  }

  /** POST /posts/:id/promotions. */
  createPost(
    userId: string,
    postId: string,
    dto: CreatePromotionDto,
    apiBase?: string,
  ): Promise<CreatePromotionResultDto> {
    return this.createFor(userId, 'post', postId, dto, apiBase);
  }

  /** The button of a promoted post: allowed type, safe link, real phone.
   * A case (the client's request) has no button — it is always «Respond». */
  private checkCta(
    type: PromotionTarget,
    dto: CreatePromotionDto,
    settings: PromotionSettings,
  ): { type: string; value: string | null } | null {
    if (type !== 'post' || !dto.ctaType || !settings.ctaEnabled) return null;
    const bad = (message: string) =>
      new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });
    if (!settings.ctaTypes.includes(dto.ctaType)) {
      throw bad('This button is not available.');
    }
    const value = dto.ctaValue?.trim() || null;
    if (dto.ctaType === 'more' || dto.ctaType === 'download') {
      if (!value || !isAllowedAdLink(value)) {
        throw bad('Use an https link to your site (no shorteners or chats).');
      }
    } else if (dto.ctaType === 'call') {
      if (!value || !/^\+[1-9]\d{6,14}$/.test(value)) {
        throw bad('Enter the phone in international format, +123456789.');
      }
    }
    return { type: dto.ctaType, value };
  }

  private async createFor(
    userId: string,
    type: PromotionTarget,
    id: string,
    dto: CreatePromotionDto,
    apiBase?: string,
  ): Promise<CreatePromotionResultDto> {
    const settings = await this.settings();
    await this.assertEntitled(userId, settings);
    await this.assertVerified(userId);
    const target = await this.ownedTarget(userId, type, id);
    if (!(await this.boostAllowed(userId, type, target.video, settings))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Promotion is not available right now.',
      });
    }
    this.assertDays(dto.days, settings);
    const daily = this.dailyBudget(dto.dailyBudgetCents, settings, true);
    // Owner 2026-10-27: what the buyer pays for. The price and the units are
    // frozen on the row now; a later change of the admin prices never
    // touches a boost that is already bought.
    const model = this.pick(settings, type, target.video, dto.billing);
    if (!model || (dto.billing && model.billing !== dto.billing)) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'This way to pay is not available right now.',
      });
    }
    if (!target.promotable) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message:
          type === 'post'
            ? 'Only a published post can be promoted.'
            : 'Only an open case can be promoted.',
      });
    }
    const cta = this.checkCta(type, dto, settings);
    const audience =
      type === 'post' && dto.audience ? parseAudience(dto.audience) : null;
    const promo = dto.promoCode
      ? await this.validPromo(userId, dto.promoCode)
      : null;
    const useCredits = dto.useCredits ?? true;
    const review = await this.needsReview(target, settings);

    const { row, creditDaysUsed, starsCharged } = await withTxRetry(
      this.prisma,
      async (tx) => {
        const now = new Date();
        const active = await tx.casePromotion.findFirst({
          where: {
            ...targetWhere(target),
            OR: [
              { status: 'active', ends_at: { gt: now } },
              { status: 'pending_review' },
            ],
          },
          select: { id: true },
        });
        if (active) {
          // Extending a running boost is allowed; a boost waiting for review
          // is not running yet.
          const running = dto.extend
            ? await tx.casePromotion.findFirst({
                where: {
                  ...targetWhere(target),
                  user_id: userId,
                  status: 'active',
                  ends_at: { gt: now },
                },
                select: { id: true },
              })
            : null;
          if (!running) throw alreadyActive();
        }
        // An earlier unpaid checkout of this target gives its credits back.
        const stale = await tx.casePromotion.findMany({
          where: {
            ...targetWhere(target),
            user_id: userId,
            status: 'pending_payment',
          },
        });
        for (const s of stale) {
          await tx.casePromotion.update({
            where: { id: s.id },
            data: { status: 'canceled', cancel_reason: 'superseded' },
          });
          await this.referrals.restorePromotionCredits(tx, userId, s.id);
          await this.releasePromo(tx, s.promo_code_id, userId);
        }
        const available = useCredits
          ? await this.referrals.promotionCreditDays(userId, tx)
          : 0;
        const q = quotePromotion({
          days: dto.days,
          priceCentsPerDay: daily,
          creditDaysAvailable: available,
          useCredits,
          promo,
          creditDayValueCents: settings.priceCentsPerDay,
        });
        // Paid with stars: the balance is debited right here, so the
        // boost behaves like a free one (no checkout) — all or nothing.
        let starsCharged = 0;
        if (dto.payWith === 'stars' && q.totalCents > 0) {
          starsCharged = (await this.stars?.starsForCents(q.totalCents)) ?? 0;
          if (starsCharged <= 0) {
            throw new ForbiddenException({
              code: ErrorCode.FEATURE_DISABLED,
              message: 'Paying with stars is not available right now.',
            });
          }
        }
        const free = q.totalCents === 0 || starsCharged > 0;
        const startNow = free && !review;
        // An extension starts when the running boost ends.
        const begin = startNow
          ? await this.startAfterRunning(
              tx,
              {
                id: '00000000-0000-0000-0000-000000000000',
                post_id: type === 'post' ? id : null,
                case_id: type === 'case' ? id : null,
              } as CasePromotion,
              now,
            )
          : now;
        const created = await tx.casePromotion.create({
          data: {
            target_type: type,
            case_id: type === 'case' ? id : null,
            post_id: type === 'post' ? id : null,
            user_id: userId,
            days: dto.days,
            price_cents_per_day: daily,
            total_cents: q.totalCents,
            billing: model.billing,
            unit_price_cents: model.priceCents,
            target_units: unitsFor(
              model.billing,
              q.grossCents,
              model.priceCents,
            ),
            billed_actions: model.actions,
            // The older columns keep their meaning for views.
            ...(model.billing === 'impressions'
              ? {
                  cpm_cents: model.priceCents,
                  target_impressions: unitsFor(
                    'impressions',
                    q.grossCents,
                    model.priceCents,
                  ),
                }
              : {}),
            goal: dto.goal ?? null,
            cta_type: cta?.type ?? null,
            cta_value: cta?.value ?? null,
            ...(audience
              ? { audience: audience as unknown as Prisma.InputJsonObject }
              : {}),
            status: free
              ? review
                ? 'pending_review'
                : 'active'
              : 'pending_payment',
            starts_at: startNow ? begin : null,
            ends_at: startNow
              ? new Date(begin.getTime() + dto.days * DAY_MS)
              : null,
            promo_code_id: promo?.id ?? null,
            paid_stars: starsCharged,
          },
        });
        if (starsCharged > 0) {
          await this.stars!.debit(
            tx,
            userId,
            starsCharged,
            'boost',
            `boost:${created.id}`,
            { refId: created.id },
          );
        }
        const used =
          q.creditDaysUsed > 0
            ? await this.referrals.consumePromotionCredits(
                tx,
                userId,
                created.id,
                q.creditDaysUsed,
              )
            : 0;
        // Owner 2026-10-22 (security audit #3, finding 4): the code is
        // redeemed HERE, in the transaction that books the discount — for
        // a checkout too (released if it is never paid). Two parallel
        // requests cannot both use it, nor push it past its limit.
        if (promo) {
          await this.redeemPromo(
            tx,
            promo.id,
            userId,
            null,
            q.promoDiscountCents,
            'strict',
          );
        }
        return { row: created, creditDaysUsed: used, starsCharged };
      },
    );

    if (type === 'post') await this.archivePromotion(userId, row.id, id);
    if (row.status !== 'pending_payment') {
      if (row.status === 'active') await this.started(row);
      return {
        promotionId: row.id,
        status: row.status as PromotionStatus,
        checkoutUrl: null,
        totalCents: starsCharged > 0 ? row.total_cents : 0,
        starsCharged,
        creditDaysUsed: wholeDays(creditDaysUsed),
        creditDaysUsedExact: creditDaysUsed,
        promotion: toPromotionDto(row),
      };
    }

    // Owner 2026-10-22: our own card page (card, Apple Pay, Google Pay) in
    // place of Stripe's hosted page; the PaymentIntent is made when the page
    // opens (payPageSession). Stripe's page stays the fallback when the
    // card page is off or has no public key.
    if (apiBase && this.payLink && (await this.payLink.enabled())) {
      const link = await this.payLink.link(
        userId,
        { kind: 'promotion', promotionId: row.id },
        apiBase,
      );
      return {
        promotionId: row.id,
        status: 'pending_payment',
        checkoutUrl: link.url,
        totalCents: row.total_cents,
        starsCharged: 0,
        creditDaysUsed: wholeDays(creditDaysUsed),
        creditDaysUsedExact: creditDaysUsed,
        promotion: toPromotionDto(row),
      };
    }

    let session: { id: string; url: string };
    try {
      if (!this.provider?.createOneTimeCheckout) {
        throw new ServiceUnavailableException({
          code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
          message: 'Payments are not configured on this server.',
        });
      }
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const base = (
        this.config.get<string>('APP_LINK_BASE_URL') ?? 'https://lawbid.app'
      ).replace(/\/+$/, '');
      const what = type === 'post' ? 'post' : 'case';
      const ref = type === 'post' ? `post_id=${id}` : `case_id=${id}`;
      session = await this.provider.createOneTimeCheckout({
        customerEmail: user?.email ?? null,
        amountCents: row.total_cents,
        description: `LawBid ${what} promotion — ${row.days} day${row.days === 1 ? '' : 's'}`,
        metadata: {
          kind: PROMOTION_CHECKOUT_KIND,
          promotionId: row.id,
          ...(type === 'post' ? { postId: id } : { caseId: id }),
          userId,
        },
        successUrl: `${base}/promotion/success?promotion_id=${row.id}&${ref}`,
        cancelUrl: `${base}/promotion/cancel?promotion_id=${row.id}&${ref}`,
        idempotencyKey: `case-promotion:${row.id}`,
      });
    } catch (e) {
      await this.abandon(row.id, userId, 'checkout_failed');
      throw e;
    }
    const updated = await this.prisma.casePromotion.update({
      where: { id: row.id },
      data: { stripe_checkout_id: session.id },
    });
    return {
      promotionId: row.id,
      status: 'pending_payment',
      checkoutUrl: session.url,
      totalCents: row.total_cents,
      starsCharged: 0,
      creditDaysUsed: wholeDays(creditDaysUsed),
      creditDaysUsedExact: creditDaysUsed,
      promotion: toPromotionDto(updated),
    };
  }

  /** GET /me/promotions — the owner's promotions with their stats. */
  async mine(
    userId: string,
    rawCursor?: string,
  ): Promise<{ items: MyPromotionDto[]; nextCursor: string | null }> {
    const PAGE = 20;
    const cursor = rawCursor ? decodeCursor(rawCursor) : undefined;
    const rows = await this.prisma.casePromotion.findMany({
      where: {
        user_id: userId,
        status: { notIn: ['canceled'] },
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = await this.withPending(rows.slice(0, PAGE));
    const titles = await this.titles(page);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        ...toPromotionDto(r),
        title: titles.get(r.id) ?? '',
      })),
      nextCursor:
        rows.length > PAGE && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  /** GET /promotions/:id/stats — the numbers by day (owner only). */
  async stats(userId: string, id: string): Promise<PromotionStatsDto> {
    const row = await this.prisma.casePromotion.findUnique({ where: { id } });
    if (!row || row.user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Promotion not found.',
      });
    }
    const [p] = await this.withPending([row]);
    const [rows, titles] = await Promise.all([
      this.prisma.promotionDaily.findMany({
        where: { promotion_id: id },
        orderBy: { day_key: 'asc' },
        take: 120,
      }),
      this.titles([p]),
    ]);
    // Spent so far: the paid days that already ran, pro rata.
    const span = Math.max(
      1,
      (p.ends_at?.getTime() ?? 0) - (p.starts_at?.getTime() ?? 0),
    );
    const ran = p.starts_at
      ? Math.min(span, Math.max(0, Date.now() - p.starts_at.getTime()))
      : 0;
    const done = ['finished', 'refunded'].includes(p.status) ? span : ran;
    return {
      promotion: { ...toPromotionDto(p), title: titles.get(p.id) ?? '' },
      days: rows.map((r) => ({
        day: r.day_key,
        impressions: r.impressions,
        reach: r.reach,
        clicks: r.clicks,
      })),
      spentCents: Math.round((p.total_cents * done) / span),
    };
  }

  /** Case title / post title (or text start) per promotion id. */
  async titles(rows: CasePromotion[]): Promise<Map<string, string>> {
    const caseIds = rows.flatMap((r) => (r.case_id ? [r.case_id] : []));
    const postIds = rows.flatMap((r) => (r.post_id ? [r.post_id] : []));
    const [cases, posts] = await Promise.all([
      caseIds.length
        ? this.prisma.case.findMany({
            where: { id: { in: caseIds } },
            select: { id: true, title: true },
          })
        : [],
      postIds.length
        ? this.prisma.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true, title: true, body: true },
          })
        : [],
    ]);
    const c = new Map(cases.map((x) => [x.id, x.title]));
    const p = new Map(
      posts.map((x) => [
        x.id,
        (x.title?.trim() || x.body.trim().split('\n')[0] || '').slice(0, 120),
      ]),
    );
    return new Map(
      rows.map((r) => [
        r.id,
        (r.post_id ? p.get(r.post_id) : r.case_id ? c.get(r.case_id) : '') ??
          '',
      ]),
    );
  }

  /** POST /promotions/:id/stop — the owner stops it early (views: no refund;
   * per people / taps / actions: the unspent part goes back). */
  async stop(userId: string, id: string): Promise<CasePromotionDto> {
    const p = await this.prisma.casePromotion.findUnique({ where: { id } });
    if (!p || p.user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Promotion not found.',
      });
    }
    if (p.status === 'pending_payment') {
      // Owner 2026-10-22 («Отменить» on «Завершить оплату»): the payment
      // is voided at Stripe first, so the page left open can not take the
      // money later. Paid meanwhile → it is applied instead (the owner sees
      // the running promotion, nothing is lost).
      if (await this.voidPayment(p.stripe_checkout_id)) {
        return toPromotionDto(
          await this.prisma.casePromotion.findUniqueOrThrow({ where: { id } }),
        );
      }
      await this.abandon(p.id, userId, 'stopped_by_owner');
    } else if (p.status === 'active') {
      const stopped = await this.prisma.casePromotion.updateMany({
        where: { id, status: 'active' },
        data: {
          status: 'finished',
          cancel_reason: 'stopped_by_owner',
          ends_at: new Date(),
        },
      });
      this.delivery?.invalidate();
      // Paid per people / taps / actions: what was not used goes back.
      if (stopped.count > 0) await this.unspent?.refundUnspent(id);
    } else {
      throw new ConflictException({
        code: ErrorCode.PROMOTION_INVALID_STATE,
        message: 'Only a running or unpaid promotion can be stopped.',
      });
    }
    return toPromotionDto(
      await this.prisma.casePromotion.findUniqueOrThrow({ where: { id } }),
    );
  }

  /** POST /promotions/:id/click — a viewer opened a promoted item. */
  async click(userId: string, id: string): Promise<{ ok: boolean }> {
    return { ok: (await this.delivery?.click(userId, id)) ?? false };
  }

  // ---- payment confirmation ----------------------------------------------

  /**
   * Owner 2026-10-22: closes the promotion's open payment (our card page's
   * PaymentIntent or Stripe's hosted session). Returns true when it turned
   * out to be paid already — it is then applied, not cancelled.
   */
  private async voidPayment(providerId: string | null): Promise<boolean> {
    if (!providerId || !this.provider) return false;
    if (isPaymentIntentId(providerId)) {
      const pi = await this.provider.cancelPaymentIntent?.(providerId);
      if (pi?.status === 'succeeded') {
        return this.applyCheckout(paymentIntentAsCheckout(pi));
      }
      return false;
    }
    const s = await this.provider.expireCheckoutSession?.(providerId);
    if (s?.status === 'complete') return this.applyCheckout(s);
    return false;
  }

  /**
   * Owner 2026-10-22: our card page opened for an unpaid promotion — the
   * PaymentIntent it confirms (made once, kept on the row). A promotion
   * paid meanwhile answers `paid` so the page shows the success screen.
   */
  async payPageSession(
    userId: string,
    id: string,
  ): Promise<{
    paid: boolean;
    amountCents: number;
    currency: string;
    days: number;
    target: PromotionTarget;
    clientSecret: string | null;
    paymentIntentId: string | null;
  }> {
    const row = await this.prisma.casePromotion.findUnique({ where: { id } });
    if (!row || row.user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Promotion not found.',
      });
    }
    const target: PromotionTarget = row.post_id ? 'post' : 'case';
    const base = {
      amountCents: row.total_cents,
      currency: 'usd',
      days: row.days,
      target,
    };
    if (row.status === 'active' || row.status === 'pending_review') {
      return { ...base, paid: true, clientSecret: null, paymentIntentId: null };
    }
    if (row.status !== 'pending_payment') {
      throw new ConflictException({
        code: ErrorCode.PROMOTION_INVALID_STATE,
        message: 'This promotion was cancelled. Start it again from the app.',
      });
    }
    if (!this.provider?.createPaymentIntent) {
      throw new ServiceUnavailableException({
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are not configured on this server.',
      });
    }
    let current = row.stripe_checkout_id;
    if (current && !isPaymentIntentId(current)) {
      // A Stripe hosted session from before: closed first (paid → applied).
      if (await this.voidPayment(current)) {
        return {
          ...base,
          paid: true,
          clientSecret: null,
          paymentIntentId: null,
        };
      }
      current = null;
    }
    if (current) {
      const pi = await this.provider.retrievePaymentIntent?.(current);
      if (pi?.status === 'succeeded') {
        await this.applyCheckout(paymentIntentAsCheckout(pi));
        return {
          ...base,
          paid: true,
          clientSecret: null,
          paymentIntentId: null,
        };
      }
      if (pi && pi.status !== 'canceled') {
        return {
          ...base,
          paid: false,
          clientSecret: pi.clientSecret,
          paymentIntentId: pi.id,
        };
      }
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const what = row.post_id ? 'post' : 'case';
    const pi = await this.provider.createPaymentIntent({
      amountCents: row.total_cents,
      currency: 'usd',
      description: `LawBid ${what} promotion — ${row.days} day${row.days === 1 ? '' : 's'}`,
      metadata: {
        kind: PROMOTION_CHECKOUT_KIND,
        promotionId: row.id,
        ...(row.post_id ? { postId: row.post_id } : {}),
        ...(row.case_id ? { caseId: row.case_id } : {}),
        userId,
      },
      receiptEmail: user?.email ?? null,
      idempotencyKey: `case-promotion-pi:${row.id}`,
    });
    await this.prisma.casePromotion.updateMany({
      where: { id: row.id, status: 'pending_payment' },
      data: { stripe_checkout_id: pi.id },
    });
    return {
      ...base,
      paid: false,
      clientSecret: pi.clientSecret,
      paymentIntentId: pi.id,
    };
  }

  /** The card page says it paid: check the PaymentIntent and apply it. */
  async payPageConfirm(userId: string, id: string): Promise<boolean> {
    const row = await this.prisma.casePromotion.findUnique({ where: { id } });
    if (!row || row.user_id !== userId) return false;
    if (row.status === 'active' || row.status === 'pending_review') return true;
    if (!row.stripe_checkout_id) return false;
    return this.applyCheckoutById(row.stripe_checkout_id);
  }

  async applyCheckoutById(sessionId: string): Promise<boolean> {
    try {
      if (isPaymentIntentId(sessionId)) {
        const pi = await this.provider?.retrievePaymentIntent?.(sessionId);
        return pi
          ? await this.applyCheckout(paymentIntentAsCheckout(pi))
          : false;
      }
      const session = this.provider
        ? await this.provider.retrieveCheckoutSession(sessionId)
        : null;
      return session ? await this.applyCheckout(session) : false;
    } catch (e) {
      this.logger.warn(
        { sessionId, err: String(e) },
        'promotion checkout check failed',
      );
      return false;
    }
  }

  /**
   * A paid promotion checkout (webhook, the fake page, or the app's state
   * read) → active (or pending_review) + a Payment row. Idempotent: only a
   * pending (or system-cancelled) promotion with this session id changes.
   */
  async applyCheckout(session: ProviderCheckoutSession): Promise<boolean> {
    if (session.metadata.kind !== PROMOTION_CHECKOUT_KIND) return false;
    if (session.status !== 'complete') return false;
    if (session.paymentStatus && session.paymentStatus !== 'paid') return false;
    const id = session.metadata.promotionId;
    if (!id) return false;
    const settings = await this.settings();
    const before = await this.prisma.casePromotion.findUnique({
      where: { id },
    });
    if (!before) return false;
    const review = await this.needsReview(
      await this.targetOf(before),
      settings,
    );
    const started = await withTxRetry(this.prisma, async (tx) => {
      const p = await tx.casePromotion.findUnique({ where: { id } });
      if (!p || p.stripe_checkout_id !== session.id) return null;
      const revivable =
        p.status === 'pending_payment' ||
        (p.status === 'canceled' &&
          !p.canceled_by &&
          REVIVABLE_REASONS.includes(p.cancel_reason ?? ''));
      if (!revivable) return null;
      const now = new Date();
      const payment = await tx.payment.create({
        data: {
          user_id: p.user_id,
          stripe_payment_intent_id: session.paymentIntentId ?? null,
          amount_cents: session.amountTotalCents ?? p.total_cents,
          currency: 'usd',
          status: 'succeeded',
          paid_at: now,
        },
      });
      await this.ledger?.paymentReceived(tx, payment, 'revenue_promotions');
      if (review) {
        const row = await tx.casePromotion.update({
          where: { id: p.id },
          data: {
            status: 'pending_review',
            payment_id: payment.id,
            cancel_reason: null,
          },
        });
        if (p.promo_code_id) {
          await this.redeemPromo(
            tx,
            p.promo_code_id,
            p.user_id,
            payment.id,
            Math.max(0, p.days * p.price_cents_per_day - p.total_cents),
            'paid',
          );
        }
        return { row, live: false };
      }
      const startsAt = await this.startAfterRunning(tx, p, now);
      const row = await tx.casePromotion.update({
        where: { id: p.id },
        data: {
          status: 'active',
          starts_at: startsAt,
          ends_at: new Date(startsAt.getTime() + p.days * DAY_MS),
          payment_id: payment.id,
          cancel_reason: null,
        },
      });
      if (p.promo_code_id) {
        await this.redeemPromo(
          tx,
          p.promo_code_id,
          p.user_id,
          payment.id,
          Math.max(0, p.days * p.price_cents_per_day - p.total_cents),
          'paid',
        );
      }
      return { row, live: true };
    });
    if (!started) return false;
    if (started.live) await this.started(started.row);
    return true;
  }

  /** Starts now, or right after a running promotion of the same target. */
  async startAfterRunning(
    tx: Prisma.TransactionClient,
    p: CasePromotion,
    now: Date,
  ): Promise<Date> {
    const running = await tx.casePromotion.findFirst({
      where: {
        ...(p.post_id ? { post_id: p.post_id } : { case_id: p.case_id }),
        status: 'active',
        ends_at: { gt: now },
        id: { not: p.id },
      },
      orderBy: { ends_at: 'desc' },
    });
    return running?.ends_at && running.ends_at > now ? running.ends_at : now;
  }

  /** Push "your promotion started" and refresh the feeds' list. */
  async started(p: CasePromotion): Promise<void> {
    this.delivery?.invalidate();
    await this.notifications
      ?.emit({
        type: 'promotion_started',
        recipientId: p.user_id,
        payload: {
          promotionId: p.id,
          ...(p.case_id ? { caseId: p.case_id } : {}),
          ...(p.post_id ? { postId: p.post_id } : {}),
        },
      })
      .catch(() => undefined);
  }

  // ---- expiry ---------------------------------------------------------------

  /** Cron `promotions.expire`: ended → finished; unpaid checkouts older
   * than a day → canceled (credit days given back); a promotion whose
   * content was hidden / deleted / closed meanwhile stops. */
  async expire(
    now = new Date(),
  ): Promise<{ finished: number; abandoned: number }> {
    const ended = await this.prisma.casePromotion.findMany({
      where: { status: 'active', ends_at: { lt: now } },
      select: { id: true, user_id: true, case_id: true, post_id: true },
      take: 500,
    });
    let finished = 0;
    for (const e of ended) {
      if (await this.finishOne(e, 'time_over')) finished += 1;
    }
    // Content that can no longer be shown.
    const running = await this.prisma.casePromotion.findMany({
      where: { status: 'active', ends_at: { gte: now } },
      select: { id: true, user_id: true, case_id: true, post_id: true },
      take: 1000,
    });
    for (const r of running) {
      const t = await this.targetOf(r).catch(() => null);
      if (!t || !t.promotable) {
        if (await this.finishOne(r, 'content_unavailable')) finished += 1;
      }
    }
    const stale = await this.prisma.casePromotion.findMany({
      where: {
        status: 'pending_payment',
        created_at: { lt: new Date(now.getTime() - PENDING_PAYMENT_TTL_MS) },
      },
      select: { id: true, user_id: true },
      take: 200,
    });
    let abandoned = 0;
    for (const s of stale) {
      if (await this.abandon(s.id, s.user_id, 'checkout_expired')) {
        abandoned += 1;
      }
    }
    return { finished, abandoned };
  }

  private async finishOne(
    p: {
      id: string;
      user_id: string;
      case_id: string | null;
      post_id: string | null;
    },
    reason: string,
  ): Promise<boolean> {
    if (this.delivery) return this.delivery.finish(p.id, p, reason);
    const res = await this.prisma.casePromotion.updateMany({
      where: { id: p.id, status: 'active' },
      data: { status: 'finished', cancel_reason: reason },
    });
    return res.count > 0;
  }

  /** pending_payment → canceled (system), credit days restored. */
  async abandon(id: string, userId: string, reason: string): Promise<boolean> {
    return withTxRetry(this.prisma, async (tx) => {
      const res = await tx.casePromotion.updateMany({
        where: { id, status: 'pending_payment' },
        data: { status: 'canceled', cancel_reason: reason },
      });
      if (res.count === 0) return false;
      await this.referrals.restorePromotionCredits(tx, userId, id);
      // An unpaid checkout gives its promo code back (audit #3).
      const row = await tx.casePromotion.findUnique({
        where: { id },
        select: { promo_code_id: true },
      });
      await this.releasePromo(tx, row?.promo_code_id ?? null, userId);
      return true;
    });
  }

  // ---- helpers ------------------------------------------------------------

  private assertDays(days: number, settings: PromotionSettings): void {
    if (!Number.isInteger(days) || days < 1 || days > settings.maxDays) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Choose 1–${settings.maxDays} days.`,
        details: { field: 'days', max: settings.maxDays },
      });
    }
  }

  /** The chosen daily budget, else the default; out of range → 400 when
   * [strict] (a purchase), clamped for a quote. */
  private dailyBudget(
    raw: number | undefined,
    settings: PromotionSettings,
    strict = false,
  ): number {
    const min = settings.minDailyBudgetCents;
    const max = settings.maxDailyBudgetCents;
    const fallback = Math.min(max, Math.max(min, settings.priceCentsPerDay));
    if (raw === undefined) return fallback;
    if (strict && (raw < min || raw > max)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `The daily budget must be between ${min} and ${max} cents.`,
        details: { field: 'dailyBudgetCents', min, max },
      });
    }
    return Math.min(max, Math.max(min, raw));
  }

  /** Automatic check: off → always staff; on → staff only when someone
   * has an open report on the content. */
  private async needsReview(
    target: OwnedTarget,
    settings: PromotionSettings,
  ): Promise<boolean> {
    if (!settings.autoApprove) return true;
    const reports = await this.prisma.report.count({
      where: { target_type: target.type, target_id: target.id, status: 'open' },
    });
    return reports > 0;
  }

  private async ownedTarget(
    userId: string,
    type: PromotionTarget,
    id: string,
  ): Promise<OwnedTarget> {
    if (type === 'post') {
      const post = await this.prisma.post.findUnique({
        where: { id },
        select: {
          author_id: true,
          status: true,
          deleted_at: true,
          video_asset_id: true,
        },
      });
      if (!post || post.deleted_at || post.author_id !== userId) {
        throw postNotFound();
      }
      return {
        type,
        id,
        promotable: post.status === 'published',
        video: post.video_asset_id !== null,
      };
    }
    const kase = await this.prisma.case.findUnique({
      where: { id },
      select: { id: true, client_id: true, status: true, deleted_at: true },
    });
    if (!kase || kase.deleted_at || kase.client_id !== userId) {
      throw caseNotFound();
    }
    return { type, id, promotable: kase.status === 'open', video: false };
  }

  /** The target of a stored promotion, owner-agnostic. */
  async targetOf(p: {
    case_id: string | null;
    post_id: string | null;
  }): Promise<OwnedTarget> {
    if (p.post_id) {
      const post = await this.prisma.post.findUnique({
        where: { id: p.post_id },
        select: { status: true, deleted_at: true, video_asset_id: true },
      });
      return {
        type: 'post',
        id: p.post_id,
        promotable: !!post && !post.deleted_at && post.status === 'published',
        video: !!post?.video_asset_id,
      };
    }
    const kase = p.case_id
      ? await this.prisma.case.findUnique({
          where: { id: p.case_id },
          select: { status: true, deleted_at: true },
        })
      : null;
    return {
      type: 'case',
      id: p.case_id ?? '',
      promotable: !!kase && !kase.deleted_at && kase.status === 'open',
      video: false,
    };
  }

  private recent(target: OwnedTarget): Promise<CasePromotion[]> {
    return this.prisma.casePromotion.findMany({
      where: targetWhere(target),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 10,
    });
  }

  /** A promo code usable for a promotion by this client, or 400. */
  async validPromo(userId: string, raw: string): Promise<PromoDiscount> {
    const invalid = new BadRequestException({
      code: ErrorCode.PROMO_CODE_INVALID,
      message: 'This promo code is not valid for promotion.',
      details: { field: 'promoCode' },
    });
    const code = raw.trim().toUpperCase();
    const p = await this.prisma.promoCode.findUnique({ where: { code } });
    // Owner 2026-10-22 (security audit #3, finding 4): the audience is the
    // buyer's role, as for subscriptions (admin-billing/promo-rules.ts).
    const buyer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const now = Date.now();
    if (
      !p ||
      !p.active ||
      !['any', 'promotion'].includes(p.applies_to) ||
      !['all', 'client', 'attorney'].includes(p.audience) ||
      (p.audience !== 'all' && p.audience !== buyer?.role) ||
      (p.starts_at && p.starts_at.getTime() > now) ||
      (p.expires_at && p.expires_at.getTime() <= now) ||
      (p.max_redemptions !== null && p.redeemed_count >= p.max_redemptions) ||
      !['percent', 'amount', 'free_days'].includes(p.discount_type)
    ) {
      throw invalid;
    }
    const used = await this.prisma.promoRedemption.findUnique({
      where: { promo_id_user_id: { promo_id: p.id, user_id: userId } },
      select: { id: true },
    });
    if (used) throw invalid;
    return {
      id: p.id,
      discountType: p.discount_type as PromoDiscount['discountType'],
      percentOff: p.percent_off,
      amountOffCents: p.amount_off_cents,
      freeDays: p.free_days,
    };
  }

  /**
   * Owner 2026-10-22 (security audit #3, finding 4; ASVS V11.1.6 — no
   * check-then-act on a limited resource). The redemption row goes in
   * FIRST (`ON CONFLICT DO NOTHING` on (promo, user)), then the counter
   * moves only while `redeemed_count < max_redemptions` — both inside the
   * caller's transaction, like Stripe's atomic `max_redemptions`.
   *
   * - `strict` (booking the promotion): an already used or exhausted code
   *   throws, which rolls the whole booking back.
   * - `paid` (the payment came through): the code was reserved at booking,
   *   so the row only gets the payment; a revived checkout whose reservation
   *   was released re-redeems, and never refuses money already taken.
   */
  private async redeemPromo(
    tx: Prisma.TransactionClient,
    promoId: string,
    userId: string,
    paymentId: string | null,
    amountOffCents: number,
    mode: 'strict' | 'paid',
  ): Promise<void> {
    if (mode === 'paid') {
      const attached = await tx.promoRedemption.updateMany({
        where: { promo_id: promoId, user_id: userId, payment_id: null },
        data: { payment_id: paymentId, amount_off_cents: amountOffCents },
      });
      if (attached.count > 0) return;
    }
    const inserted = await tx.promoRedemption.createMany({
      data: [
        {
          promo_id: promoId,
          user_id: userId,
          payment_id: paymentId,
          amount_off_cents: amountOffCents,
        },
      ],
      skipDuplicates: true,
    });
    const counted =
      inserted.count === 1
        ? await tx.promoCode.updateMany({
            where: {
              id: promoId,
              OR: [
                { max_redemptions: null },
                {
                  redeemed_count: {
                    lt: tx.promoCode.fields.max_redemptions,
                  },
                },
              ],
            },
            data: { redeemed_count: { increment: 1 } },
          })
        : { count: 0 };
    if (counted.count === 1) return;
    if (mode === 'strict') {
      throw new BadRequestException({
        code: ErrorCode.PROMO_CODE_INVALID,
        message: 'This promo code is not valid for promotion.',
        details: { field: 'promoCode' },
      });
    }
    this.logger.warn(
      { promoId, userId, paymentId },
      'paid promotion kept a promo code that was used up meanwhile',
    );
  }

  /** An unpaid checkout's reserved code goes back (audit #3, finding 4). */
  private async releasePromo(
    tx: Prisma.TransactionClient,
    promoId: string | null,
    userId: string,
  ): Promise<void> {
    if (!promoId) return;
    const freed = await tx.promoRedemption.deleteMany({
      where: { promo_id: promoId, user_id: userId, payment_id: null },
    });
    if (freed.count === 0) return;
    await tx.promoCode.updateMany({
      where: { id: promoId, redeemed_count: { gt: 0 } },
      data: { redeemed_count: { decrement: 1 } },
    });
  }
}
