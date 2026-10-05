/**
 * Owner 2026-10-05: client → attorney payments through the platform.
 * One app_config row (`payments.settings`, JSON) edited from
 * GET/PUT /admin/case-payments/settings; missing fields fall back to the
 * defaults below.
 *
 * Owner's decision 2026-10-05: the platform does NOT share the
 * attorney's fee (ABA Model Rule 5.4: a lawyer may not share legal fees
 * with a non-lawyer, and a percentage commission reads as exactly
 * that). There is no percent option at all; the default is `none`. A
 * flat service charge per payment exists as an admin option, off by
 * default. Stripe's own card cost is passed to the client by default so
 * the attorney receives the full amount. The disclaimer below is shown
 * to the client before paying, to the attorney when connecting Stripe
 * and on the payment record; the owner's lawyer can edit it in the admin.
 */
export const PAYMENT_SETTINGS_KEY = 'payments.settings';
export const PAYMENTS_FLAG = 'payments_in_app';

export const FEE_TYPES = ['none', 'fixed'] as const;
export type FeeType = (typeof FEE_TYPES)[number];
export const FEE_PAYERS = ['client', 'attorney'] as const;
export type FeePayer = (typeof FEE_PAYERS)[number];

export interface PaymentSettings {
  /** none = no platform fee (default); fixed = a flat service charge per
   * payment. Never a share of the attorney's fee. */
  feeType: FeeType;
  feeFixedCents: number;
  /** client = charged on top of the attorney's fee; attorney = deducted
   * from what the attorney receives. */
  feePayer: FeePayer;
  /** Add an estimate of Stripe's card fee to what the client pays, so the
   * attorney receives the full amount. */
  passProcessingFeeToClient: boolean;
  /** Stripe's card rate used for that estimate (2.9 % + 30 ¢ by default). */
  processingFeePercent: number;
  processingFeeFixedCents: number;
  minAmountCents: number;
  maxAmountCents: number;
  /** The client may pay any amount (not only the bid). */
  allowCustomAmount: boolean;
  /** The client may pay the bid in parts (deposit + balance). */
  allowPartial: boolean;
  /** How long after a payment the attorney may refund it from the app. */
  refundWindowDays: number;
  /** Legal disclaimer shown to the client, the attorney and on records. */
  disclaimerEn: string;
  disclaimerRu: string;
}

export const DEFAULT_DISCLAIMER_EN =
  "LawBid only provides the technical means to pay. Your payment goes directly to the attorney's own Stripe account; LawBid is not a party to the agreement between you and the attorney, receives no share of the attorney's fee, is not a law firm and does not provide legal services. Payment terms, refunds and disputes are between you and the attorney. Payments are processed by Stripe under Stripe's terms.";
export const DEFAULT_DISCLAIMER_RU =
  'LawBid только предоставляет техническую возможность оплаты. Платёж идёт напрямую адвокату на его счёт в Stripe; LawBid не является стороной соглашения между вами и адвокатом, не получает долю гонорара, не является юридической фирмой и не оказывает юридических услуг. Условия оплаты, возвраты и споры решаются между вами и адвокатом. Обработку платежей выполняет Stripe по его условиям.';

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  feeType: 'none',
  feeFixedCents: 0,
  feePayer: 'client',
  passProcessingFeeToClient: true,
  processingFeePercent: 2.9,
  processingFeeFixedCents: 30,
  minAmountCents: 500,
  maxAmountCents: 2_500_000,
  allowCustomAmount: true,
  allowPartial: true,
  refundWindowDays: 180,
  disclaimerEn: DEFAULT_DISCLAIMER_EN,
  disclaimerRu: DEFAULT_DISCLAIMER_RU,
};

/** Stripe's smallest USD charge. */
export const MIN_CHARGE_CENTS = 50;
/** Unpaid checkouts are given up after this long (Stripe: 24 h). */
export const PENDING_PAYMENT_TTL_MS = 24 * 3_600_000;

export const PAYMENT_KINDS = ['bid', 'deposit', 'balance', 'custom'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_STATUSES = [
  'pending_payment',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded',
  'disputed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYOUT_ACCOUNT_STATUSES = [
  'pending',
  'onboarding',
  'active',
  'restricted',
  'disabled',
] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : null;
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
    ? Math.round(v * 100) / 100
    : null;
const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 4000
    ? v.trim()
    : null;
const bool = (v: unknown, d: boolean): boolean =>
  typeof v === 'boolean' ? v : d;
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T =>
  typeof v === 'string' && (all as readonly string[]).includes(v)
    ? (v as T)
    : d;

export function parsePaymentSettings(raw: unknown): PaymentSettings {
  const d = DEFAULT_PAYMENT_SETTINGS;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  const minAmountCents =
    int(r.minAmountCents, MIN_CHARGE_CENTS, 10_000_000) ?? d.minAmountCents;
  const maxAmountCents = Math.max(
    minAmountCents,
    int(r.maxAmountCents, MIN_CHARGE_CENTS, 100_000_000) ?? d.maxAmountCents,
  );
  return {
    feeType: oneOf(r.feeType, FEE_TYPES, d.feeType),
    feeFixedCents: int(r.feeFixedCents, 0, 100_000) ?? d.feeFixedCents,
    feePayer: oneOf(r.feePayer, FEE_PAYERS, d.feePayer),
    passProcessingFeeToClient: bool(
      r.passProcessingFeeToClient,
      d.passProcessingFeeToClient,
    ),
    processingFeePercent:
      num(r.processingFeePercent, 0, 15) ?? d.processingFeePercent,
    processingFeeFixedCents:
      int(r.processingFeeFixedCents, 0, 500) ?? d.processingFeeFixedCents,
    minAmountCents,
    maxAmountCents,
    allowCustomAmount: bool(r.allowCustomAmount, d.allowCustomAmount),
    allowPartial: bool(r.allowPartial, d.allowPartial),
    refundWindowDays: int(r.refundWindowDays, 0, 365) ?? d.refundWindowDays,
    disclaimerEn: text(r.disclaimerEn) ?? d.disclaimerEn,
    disclaimerRu: text(r.disclaimerRu) ?? d.disclaimerRu,
  };
}

export interface PaymentQuote {
  /** The attorney's fee the client is paying (the bid, a part, or any). */
  amountCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  /** What the client's card is charged. */
  clientTotalCents: number;
  /** What lands on the attorney's balance before Stripe's own fee. */
  attorneyNetCents: number;
  feeType: FeeType;
  feePayer: FeePayer;
}

/**
 * The money split of one payment. The platform fee is Stripe's
 * `application_fee_amount` (moved to the platform's balance): when the
 * client pays it, it is added on top of the attorney's fee, otherwise it
 * is deducted from what the attorney receives. With direct charges Stripe
 * takes its own card fee from the attorney's balance, so when the
 * processing estimate is passed to the client it is grossed up and added
 * to the client's total — the attorney then receives ≈ the full fee.
 */
export function quotePayment(
  amountCents: number,
  s: PaymentSettings,
): PaymentQuote {
  let platformFeeCents = s.feeType === 'fixed' ? s.feeFixedCents : 0;
  // A fee the attorney pays cannot exceed the payment itself.
  if (s.feePayer === 'attorney')
    platformFeeCents = Math.min(platformFeeCents, amountCents);
  const base = amountCents + (s.feePayer === 'client' ? platformFeeCents : 0);
  let processingFeeCents = 0;
  if (s.passProcessingFeeToClient) {
    // Gross-up: total × (1 − p) − fixed = base → total = (base + fixed) / (1 − p).
    const p = s.processingFeePercent / 100;
    const total = Math.ceil((base + s.processingFeeFixedCents) / (1 - p));
    processingFeeCents = Math.max(0, total - base);
  }
  return {
    amountCents,
    platformFeeCents,
    processingFeeCents,
    clientTotalCents: base + processingFeeCents,
    attorneyNetCents:
      s.feePayer === 'attorney' ? amountCents - platformFeeCents : amountCents,
    feeType: s.feeType,
    feePayer: s.feePayer,
  };
}
