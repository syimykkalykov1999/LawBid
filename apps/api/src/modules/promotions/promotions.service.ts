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
import type { CasePromotion, Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { PAYMENT_PROVIDER } from '../billing/billing.constants';
import type {
  PaymentProvider,
  ProviderCheckoutSession,
} from '../billing/payment-provider';
import { ReferralsService } from '../referrals/referrals.service';
import type {
  CasePromotionDto,
  CasePromotionStateDto,
  CreatePromotionDto,
  CreatePromotionResultDto,
  PromotionQuoteDto,
} from './promotions.dto';
import {
  parsePromotionSettings,
  PENDING_PAYMENT_TTL_MS,
  PROMOTION_SETTINGS_KEY,
  quotePromotion,
  type PromoDiscount,
  type PromotionSettings,
  type PromotionStatus,
} from './promotions.settings';

const DAY_MS = 86_400_000;
export const PROMOTION_CHECKOUT_KIND = 'case_promotion';
/** System cancellations a late payment may still revive. */
const REVIVABLE_REASONS = ['checkout_expired', 'superseded'];

type Db = Prisma.TransactionClient | PrismaService;

export function toPromotionDto(p: CasePromotion): CasePromotionDto {
  return {
    id: p.id,
    caseId: p.case_id,
    status: p.status as PromotionStatus,
    days: p.days,
    priceCentsPerDay: p.price_cents_per_day,
    totalCents: p.total_cents,
    startsAt: p.starts_at?.toISOString() ?? null,
    endsAt: p.ends_at?.toISOString() ?? null,
    impressions: p.impressions,
    createdAt: p.created_at.toISOString(),
  };
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
    message: 'This case is already promoted.',
  });
}

/**
 * Owner 2026-10-02: paid case promotion (~$10/day). The case owner pays a
 * one-time hosted checkout (or spends referral credit days / a 100 %
 * promo code); the webhook (`checkout.session.completed`, metadata
 * kind=case_promotion) activates it — starts now, or right after a
 * running promotion of the same case. Active promotions are boosted in
 * the attorney feed (CasesFeedService) and finished by the
 * `promotions.expire` cron job.
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
  ) {}

  async settings(db: Db = this.prisma): Promise<PromotionSettings> {
    const row = await db.appConfig.findUnique({
      where: { key: PROMOTION_SETTINGS_KEY },
    });
    return parsePromotionSettings(row?.value);
  }

  // ---- app --------------------------------------------------------------

  /** GET /promotions/quote?days= (credits applied when available). */
  async quote(userId: string, days: number): Promise<PromotionQuoteDto> {
    const settings = await this.settings();
    this.assertDays(days, settings);
    const creditDaysAvailable =
      await this.referrals.promotionCreditDays(userId);
    const q = quotePromotion({
      days,
      priceCentsPerDay: settings.priceCentsPerDay,
      creditDaysAvailable,
      useCredits: true,
    });
    return {
      days,
      priceCentsPerDay: q.priceCentsPerDay,
      grossCents: q.grossCents,
      totalCents: q.totalCents,
      creditDaysAvailable,
      creditDaysUsed: q.creditDaysUsed,
      maxDays: settings.maxDays,
      enabled: settings.enabled,
    };
  }

  /** GET /cases/:id/promotion — the owner's view (+ a 1-day quote). */
  async caseState(
    userId: string,
    caseId: string,
  ): Promise<CasePromotionStateDto> {
    const kase = await this.ownedCase(userId, caseId);
    let rows = await this.recent(caseId);
    const pending = rows.find(
      (r) => r.status === 'pending_payment' && r.stripe_checkout_id,
    );
    if (pending?.stripe_checkout_id) {
      // Back from the browser before the webhook: check the session.
      if (await this.applyCheckoutById(pending.stripe_checkout_id)) {
        rows = await this.recent(caseId);
      }
    }
    const now = Date.now();
    const active = rows.find(
      (r) => r.status === 'active' && (r.ends_at?.getTime() ?? 0) > now,
    );
    const shown =
      active ?? rows.find((r) => r.status === 'pending_payment') ?? rows[0];
    const settings = await this.settings();
    const quote = await this.quote(userId, 1);
    return {
      promotion: shown ? toPromotionDto(shown) : null,
      canPromote: settings.enabled && kase.status === 'open' && !active,
      quote,
    };
  }

  /** POST /cases/:id/promotions. */
  async create(
    userId: string,
    caseId: string,
    dto: CreatePromotionDto,
  ): Promise<CreatePromotionResultDto> {
    const settings = await this.settings();
    if (!settings.enabled) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Case promotion is not available right now.',
      });
    }
    this.assertDays(dto.days, settings);
    const kase = await this.ownedCase(userId, caseId);
    if (kase.status !== 'open') {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'Only an open case can be promoted.',
      });
    }
    const promo = dto.promoCode
      ? await this.validPromo(userId, dto.promoCode)
      : null;
    const useCredits = dto.useCredits ?? true;

    const { row, creditDaysUsed } = await withTxRetry(
      this.prisma,
      async (tx) => {
        const now = new Date();
        const active = await tx.casePromotion.findFirst({
          where: { case_id: caseId, status: 'active', ends_at: { gt: now } },
          select: { id: true },
        });
        if (active) throw alreadyActive();
        // An earlier unpaid checkout of this case gives its credits back.
        const stale = await tx.casePromotion.findMany({
          where: {
            case_id: caseId,
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
          priceCentsPerDay: settings.priceCentsPerDay,
          creditDaysAvailable: available,
          useCredits,
          promo,
        });
        const free = q.totalCents === 0;
        const created = await tx.casePromotion.create({
          data: {
            case_id: caseId,
            user_id: userId,
            days: dto.days,
            price_cents_per_day: settings.priceCentsPerDay,
            total_cents: q.totalCents,
            status: free ? 'active' : 'pending_payment',
            starts_at: free ? now : null,
            ends_at: free ? new Date(now.getTime() + dto.days * DAY_MS) : null,
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

    if (row.status === 'active') {
      return {
        promotionId: row.id,
        status: 'active',
        checkoutUrl: null,
        totalCents: 0,
        creditDaysUsed,
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
      session = await this.provider.createOneTimeCheckout({
        customerEmail: user?.email ?? null,
        amountCents: row.total_cents,
        description: `LawBid case promotion — ${row.days} day${row.days === 1 ? '' : 's'}`,
        metadata: {
          kind: PROMOTION_CHECKOUT_KIND,
          promotionId: row.id,
          caseId,
          userId,
        },
        successUrl: `${base}/promotion/success?promotion_id=${row.id}&case_id=${caseId}`,
        cancelUrl: `${base}/promotion/cancel?promotion_id=${row.id}&case_id=${caseId}`,
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
      creditDaysUsed,
      promotion: toPromotionDto(updated),
    };
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
   * read) → active + a Payment row. Idempotent: only a pending (or
   * system-cancelled) promotion with this session id changes.
   */
  async applyCheckout(session: ProviderCheckoutSession): Promise<boolean> {
    if (session.metadata.kind !== PROMOTION_CHECKOUT_KIND) return false;
    if (session.status !== 'complete') return false;
    if (session.paymentStatus && session.paymentStatus !== 'paid') return false;
    const id = session.metadata.promotionId;
    if (!id) return false;
    return withTxRetry(this.prisma, async (tx) => {
      const p = await tx.casePromotion.findUnique({ where: { id } });
      if (!p || p.stripe_checkout_id !== session.id) return false;
      const revivable =
        p.status === 'pending_payment' ||
        (p.status === 'canceled' &&
          !p.canceled_by &&
          REVIVABLE_REASONS.includes(p.cancel_reason ?? ''));
      if (!revivable) return false;
      const now = new Date();
      const running = await tx.casePromotion.findFirst({
        where: {
          case_id: p.case_id,
          status: 'active',
          ends_at: { gt: now },
          id: { not: p.id },
        },
        orderBy: { ends_at: 'desc' },
      });
      const startsAt =
        running?.ends_at && running.ends_at > now ? running.ends_at : now;
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
      await tx.casePromotion.update({
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
      return true;
    });
  }

  // ---- expiry ---------------------------------------------------------------

  /** Cron `promotions.expire`: ended → finished; unpaid checkouts older
   * than a day → canceled (credit days given back). */
  async expire(
    now = new Date(),
  ): Promise<{ finished: number; abandoned: number }> {
    const finished = await this.prisma.casePromotion.updateMany({
      where: { status: 'active', ends_at: { lt: now } },
      data: { status: 'finished' },
    });
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
    return { finished: finished.count, abandoned };
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

  private async ownedCase(userId: string, caseId: string) {
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, client_id: true, status: true, deleted_at: true },
    });
    if (!kase || kase.deleted_at || kase.client_id !== userId) {
      throw caseNotFound();
    }
    return kase;
  }

  private recent(caseId: string): Promise<CasePromotion[]> {
    return this.prisma.casePromotion.findMany({
      where: { case_id: caseId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 10,
    });
  }

  /** A promo code usable for a promotion by this client, or 400. */
  async validPromo(userId: string, raw: string): Promise<PromoDiscount> {
    const invalid = new BadRequestException({
      code: ErrorCode.PROMO_CODE_INVALID,
      message: 'This promo code is not valid for case promotion.',
      details: { field: 'promoCode' },
    });
    const code = raw.trim().toUpperCase();
    const p = await this.prisma.promoCode.findUnique({ where: { code } });
    const now = Date.now();
    if (
      !p ||
      !p.active ||
      !['any', 'promotion'].includes(p.applies_to) ||
      !['all', 'client'].includes(p.audience) ||
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
