/**
 * Owner 2026-10-02: paid case promotion (~$10/day). One app_config row
 * (`promotions.settings`, JSON) edited from GET/PUT
 * /admin/promotions/settings; missing fields fall back to the defaults.
 */
export const PROMOTION_SETTINGS_KEY = 'promotions.settings';

export interface PromotionSettings {
  enabled: boolean;
  priceCentsPerDay: number;
  maxDays: number;
  maxActivePerCase: number;
}

export const DEFAULT_PROMOTION_SETTINGS: PromotionSettings = {
  enabled: false,
  priceCentsPerDay: 1_000,
  maxDays: 30,
  maxActivePerCase: 1,
};

/** Promoted cases shown on top of an attorney's first feed page. */
export const PROMOTED_FEED_SLOTS = 3;
/** Stripe's smallest USD charge. */
export const MIN_CHARGE_CENTS = 50;
/** Unpaid checkouts are given up after this long (Stripe: 24 h). */
export const PENDING_PAYMENT_TTL_MS = 24 * 3_600_000;

export const PROMOTION_STATUSES = [
  'pending_payment',
  'active',
  'finished',
  'canceled',
  'refunded',
] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : null;

export function parsePromotionSettings(raw: unknown): PromotionSettings {
  const d = DEFAULT_PROMOTION_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    priceCentsPerDay:
      int(r.priceCentsPerDay, MIN_CHARGE_CENTS, 1_000_000) ??
      d.priceCentsPerDay,
    maxDays: int(r.maxDays, 1, 365) ?? d.maxDays,
    maxActivePerCase: int(r.maxActivePerCase, 1, 1) ?? d.maxActivePerCase,
  };
}

export interface PromoDiscount {
  id: string;
  discountType: 'percent' | 'amount' | 'free_days';
  percentOff: number | null;
  amountOffCents: number | null;
  freeDays: number | null;
}

export interface PromotionQuote {
  days: number;
  priceCentsPerDay: number;
  grossCents: number;
  creditDaysUsed: number;
  promoDiscountCents: number;
  totalCents: number;
}

/**
 * Price of [days]: referral credit days first, then the promo code on the
 * remaining days; a non-zero charge is at least Stripe's minimum.
 */
export function quotePromotion(input: {
  days: number;
  priceCentsPerDay: number;
  creditDaysAvailable: number;
  useCredits: boolean;
  promo?: PromoDiscount | null;
}): PromotionQuote {
  const { days, priceCentsPerDay } = input;
  const grossCents = days * priceCentsPerDay;
  const creditDaysUsed = input.useCredits
    ? Math.max(0, Math.min(days, input.creditDaysAvailable))
    : 0;
  const payableCents = (days - creditDaysUsed) * priceCentsPerDay;
  let promoDiscountCents = 0;
  const promo = input.promo;
  if (promo && payableCents > 0) {
    if (promo.discountType === 'percent' && promo.percentOff) {
      promoDiscountCents = Math.round(
        (payableCents * Math.min(100, promo.percentOff)) / 100,
      );
    } else if (promo.discountType === 'amount' && promo.amountOffCents) {
      promoDiscountCents = Math.min(payableCents, promo.amountOffCents);
    } else if (promo.discountType === 'free_days' && promo.freeDays) {
      promoDiscountCents =
        Math.min(days - creditDaysUsed, promo.freeDays) * priceCentsPerDay;
    }
  }
  let totalCents = Math.max(0, payableCents - promoDiscountCents);
  if (totalCents > 0 && totalCents < MIN_CHARGE_CENTS) {
    totalCents = MIN_CHARGE_CENTS;
    promoDiscountCents = payableCents - totalCents;
  }
  return {
    days,
    priceCentsPerDay,
    grossCents,
    creditDaysUsed,
    promoDiscountCents,
    totalCents,
  };
}
