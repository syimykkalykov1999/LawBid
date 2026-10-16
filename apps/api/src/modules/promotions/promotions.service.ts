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
import { NotificationsService } from '../notifications/notifications.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { EntitlementsService } from '../plans/entitlements.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type {
  PaymentProvider,
  ProviderCheckoutSession,
} from '../billing/payment-provider';
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
import {
  impressionsFor,
  isAllowedAdLink,
  parseAudience,
  parsePromotionSettings,
  PENDING_PAYMENT_TTL_MS,
  PROMOTION_SETTINGS_KEY,
  quotePromotion,
  reachRange,
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
    audience: p.audience ? parseAudience(p.audience) : null,
    cancelReason: p.cancel_reason,
    goal: p.goal,
    ctaType: p.cta_type,
    ctaValue: p.cta_value,
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
  ) {}

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
    if (type === 'case') return settings.enabled;
    return video ? settings.reelsEnabled : settings.postsEnabled;
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
    const estImpressions = impressionsFor(q.grossCents, settings.cpmCents);
    const reach = reachRange(estImpressions, settings.impressionsPerPerson);
    return {
      days,
      priceCentsPerDay: q.priceCentsPerDay,
      grossCents: q.grossCents,
      totalCents: q.totalCents,
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
      cpmCents: settings.cpmCents,
      estImpressions,
      estReachMin: reach.min,
      estReachMax: reach.max,
      postsEnabled: settings.postsEnabled,
      casesEnabled: settings.enabled,
      ctaTypes: settings.ctaEnabled ? settings.ctaTypes : [],
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
  ): Promise<CreatePromotionResultDto> {
    return this.createFor(userId, 'case', caseId, dto);
  }

  /** POST /posts/:id/promotions. */
  createPost(
    userId: string,
    postId: string,
    dto: CreatePromotionDto,
  ): Promise<CreatePromotionResultDto> {
    return this.createFor(userId, 'post', postId, dto);
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

    const { row, creditDaysUsed } = await withTxRetry(
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
        const free = q.totalCents === 0;
        const startNow = free && !review;
        // An extension starts when the running boost ends.
        const begin = startNow
          ? await this.startAfterRunning(
              tx,
              {
                id: '',
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
            cpm_cents: settings.cpmCents,
            target_impressions: impressionsFor(q.grossCents, settings.cpmCents),
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
          },
        });
        const used =
          q.creditDaysUsed > 0
            ? await this.referrals.consumePromotionCredits(
                tx,
                userId,
                created.id,
                q.creditDaysUsed,
              )
            : 0;
        if (free && promo) {
          await this.redeemPromo(
            tx,
            promo.id,
            userId,
            null,
            q.promoDiscountCents,
          );
        }
        return { row: created, creditDaysUsed: used };
      },
    );

    if (row.status !== 'pending_payment') {
      if (row.status === 'active') await this.started(row);
      return {
        promotionId: row.id,
        status: row.status as PromotionStatus,
        checkoutUrl: null,
        totalCents: 0,
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
    const page = rows.slice(0, PAGE);
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
    const p = await this.prisma.casePromotion.findUnique({ where: { id } });
    if (!p || p.user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Promotion not found.',
      });
    }
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

  /** POST /promotions/:id/stop — the owner stops it early (no refund). */
  async stop(userId: string, id: string): Promise<CasePromotionDto> {
    const p = await this.prisma.casePromotion.findUnique({ where: { id } });
    if (!p || p.user_id !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Promotion not found.',
      });
    }
    if (p.status === 'pending_payment') {
      await this.abandon(p.id, userId, 'stopped_by_owner');
    } else if (p.status === 'active') {
      await this.prisma.casePromotion.updateMany({
        where: { id, status: 'active' },
        data: {
          status: 'finished',
          cancel_reason: 'stopped_by_owner',
          ends_at: new Date(),
        },
      });
      this.delivery?.invalidate();
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

  async applyCheckoutById(sessionId: string): Promise<boolean> {
    try {
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
    const now = Date.now();
    if (
      !p ||
      !p.active ||
      !['any', 'promotion'].includes(p.applies_to) ||
      !['all', 'client', 'attorney'].includes(p.audience) ||
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

  private async redeemPromo(
    tx: Prisma.TransactionClient,
    promoId: string,
    userId: string,
    paymentId: string | null,
    amountOffCents: number,
  ): Promise<void> {
    const existing = await tx.promoRedemption.findUnique({
      where: { promo_id_user_id: { promo_id: promoId, user_id: userId } },
      select: { id: true },
    });
    if (existing) return;
    await tx.promoRedemption.create({
      data: {
        promo_id: promoId,
        user_id: userId,
        payment_id: paymentId,
        amount_off_cents: amountOffCents,
      },
    });
    await tx.promoCode.update({
      where: { id: promoId },
      data: { redeemed_count: { increment: 1 } },
    });
  }
}
