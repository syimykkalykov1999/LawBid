import type { Prisma, PromoCode } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import type {
  PaymentProvider,
  ProviderCouponInput,
} from '../billing/payment-provider';

/**
 * Owner 2026-10-02: promo code rules shared by the admin, the app's
 * "validate" call and the subscription checkout. Pure functions plus two
 * small Prisma helpers — no Nest dependencies, so BillingModule can use
 * them without importing the admin module.
 */
export const PROMO_DISCOUNT_TYPES = ['percent', 'amount', 'free_days'] as const;
export type PromoDiscountType = (typeof PROMO_DISCOUNT_TYPES)[number];
export const PROMO_AUDIENCES = ['all', 'attorney', 'client'] as const;
export type PromoAudience = (typeof PROMO_AUDIENCES)[number];
export const PROMO_APPLIES_TO = [
  'any',
  'monthly',
  'yearly',
  'promotion',
] as const;
export type PromoAppliesTo = (typeof PROMO_APPLIES_TO)[number];
/** What the user is buying (a promo's `applies_to` other than `any`). */
export type PromoPurchase = Exclude<PromoAppliesTo, 'any'>;

export const PROMO_CODE_RE = /^[A-Z0-9_-]{3,40}$/;

export type PromoRejectReason =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'wrong_audience'
  | 'wrong_plan'
  | 'already_used';

export type PromoRuleRow = Pick<
  PromoCode,
  | 'active'
  | 'starts_at'
  | 'expires_at'
  | 'max_redemptions'
  | 'redeemed_count'
  | 'audience'
  | 'applies_to'
>;

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The single rule: why a promo can't be used, or null when it can. */
export function promoRejectReason(
  promo: PromoRuleRow | null,
  ctx: {
    role: string | null;
    purchase: PromoPurchase;
    alreadyRedeemed: boolean;
    now?: Date;
  },
): PromoRejectReason | null {
  const now = ctx.now ?? new Date();
  if (!promo) return 'not_found';
  if (!promo.active) return 'inactive';
  if (promo.starts_at && promo.starts_at > now) return 'not_started';
  if (promo.expires_at && promo.expires_at <= now) return 'expired';
  if (
    promo.max_redemptions !== null &&
    promo.redeemed_count >= promo.max_redemptions
  ) {
    return 'exhausted';
  }
  if (promo.audience !== 'all' && promo.audience !== ctx.role) {
    return 'wrong_audience';
  }
  if (promo.applies_to !== 'any' && promo.applies_to !== ctx.purchase) {
    return 'wrong_plan';
  }
  if (ctx.alreadyRedeemed) return 'already_used';
  return null;
}

/** The discount a promo gives on a price (cents), never above it. */
export function promoDiscountCents(
  promo: Pick<PromoCode, 'discount_type' | 'percent_off' | 'amount_off_cents'>,
  priceCents: number,
): number | null {
  if (promo.discount_type === 'percent' && promo.percent_off) {
    return Math.min(
      priceCents,
      Math.round((priceCents * promo.percent_off) / 100),
    );
  }
  if (promo.discount_type === 'amount' && promo.amount_off_cents) {
    return Math.min(priceCents, promo.amount_off_cents);
  }
  return null;
}

export type PromoCheck =
  | { valid: true; promo: PromoCode }
  | { valid: false; reason: PromoRejectReason; promo: PromoCode | null };

/** Looks the code up and applies the rule for this user. */
export async function checkPromo(
  db: Pick<Prisma.TransactionClient, 'promoCode' | 'promoRedemption'>,
  input: {
    code: string;
    userId: string;
    role: string | null;
    purchase: PromoPurchase;
  },
): Promise<PromoCheck> {
  const code = normalizePromoCode(input.code);
  const promo = PROMO_CODE_RE.test(code)
    ? await db.promoCode.findUnique({ where: { code } })
    : null;
  if (!promo) return { valid: false, reason: 'not_found', promo: null };
  const alreadyRedeemed =
    (await db.promoRedemption.findUnique({
      where: {
        promo_id_user_id: { promo_id: promo.id, user_id: input.userId },
      },
      select: { id: true },
    })) !== null;
  const reason = promoRejectReason(promo, {
    role: input.role,
    purchase: input.purchase,
    alreadyRedeemed,
  });
  return reason ? { valid: false, reason, promo } : { valid: true, promo };
}

/**
 * Records a redemption once per user and bumps the counter in the same
 * transaction. False when the user already redeemed it or the code ran
 * out meanwhile (max_redemptions reached).
 */
export async function recordPromoRedemption(
  prisma: PrismaService,
  input: {
    promoId: string;
    userId: string;
    amountOffCents: number | null;
    paymentId?: string | null;
  },
): Promise<boolean> {
  return withTxRetry(prisma, async (tx) => {
    const existing = await tx.promoRedemption.findUnique({
      where: {
        promo_id_user_id: { promo_id: input.promoId, user_id: input.userId },
      },
      select: { id: true },
    });
    if (existing) return false;
    const promo = await tx.promoCode.findUnique({
      where: { id: input.promoId },
      select: { max_redemptions: true, redeemed_count: true },
    });
    if (!promo) return false;
    if (
      promo.max_redemptions !== null &&
      promo.redeemed_count >= promo.max_redemptions
    ) {
      return false;
    }
    await tx.promoRedemption.create({
      data: {
        promo_id: input.promoId,
        user_id: input.userId,
        amount_off_cents: input.amountOffCents,
        payment_id: input.paymentId ?? null,
      },
    });
    await tx.promoCode.update({
      where: { id: input.promoId },
      data: { redeemed_count: { increment: 1 } },
    });
    return true;
  });
}

/**
 * The provider coupon behind a percent/amount promo, created on first use
 * when the code was made while payments were not configured. Null for
 * free_days codes (they lengthen the trial instead).
 */
export async function ensurePromoCoupon(
  prisma: PrismaService,
  provider: PaymentProvider,
  promo: PromoCode,
  currency: string,
): Promise<string | null> {
  if (promo.discount_type === 'free_days') return null;
  if (promo.stripe_coupon_id) return promo.stripe_coupon_id;
  if (typeof provider.createCoupon !== 'function') return null;
  const created = await provider.createCoupon(couponInput(promo, currency));
  await prisma.promoCode.update({
    where: { id: promo.id },
    data: { stripe_coupon_id: created.couponId },
  });
  return created.couponId;
}

export function couponInput(
  promo: PromoCode,
  currency: string,
): ProviderCouponInput {
  return {
    code: promo.code,
    percentOff: promo.discount_type === 'percent' ? promo.percent_off : null,
    amountOffCents:
      promo.discount_type === 'amount' ? promo.amount_off_cents : null,
    currency,
    maxRedemptions: promo.max_redemptions,
    redeemBy: promo.expires_at
      ? Math.floor(promo.expires_at.getTime() / 1000)
      : null,
    metadata: { promoId: promo.id, code: promo.code },
  };
}
