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
/** Who covers Stripe's card fee: the attorney (out of the amount, as
 * Stripe takes it from the connected balance), the client (added on
 * top so the attorney receives the full amount) or half each. Never the
 * platform — direct charges make that impossible by construction. */
export const PROCESSING_FEE_PAYERS = ['client', 'attorney', 'split'] as const;
export type ProcessingFeePayer = (typeof PROCESSING_FEE_PAYERS)[number];

export interface PaymentSettings {
  /** none = no platform fee (default); fixed = a flat service charge per
   * payment. Never a share of the attorney's fee. */
  feeType: FeeType;
  feeFixedCents: number;
  /** client = charged on top of the attorney's fee; attorney = deducted
   * from what the attorney receives. */
  feePayer: FeePayer;
  /** Who covers Stripe's card fee (owner 2026-10-05: the parties, never
   * the platform). client = grossed up on top of the amount so the
   * attorney receives the full fee; attorney = out of the amount; split =
   * half each. */
  processingFeePayer: ProcessingFeePayer;
  /** Stripe's card rate used for that estimate (2.9 % + 30 ¢ by default).
   * When Stripe changes its tariff the owner edits the number here. */
  processingFeePercent: number;
  processingFeeFixedCents: number;
  /** Stripe Checkout offers to save the card for the next payment to the
   * same attorney (a Stripe customer on the attorney's account). */
  saveCards: boolean;
  /** The attorney may send the client payment requests (invoices). */
  allowInvoices: boolean;
  /** …and split them into installments (several requests with due dates). */
  allowInstallments: boolean;
  maxInstallments: number;
  /** Counter-offers allowed while the parties agree who covers Stripe's
   * fee on an invoice (like bid rounds). */
  feePayerMaxRounds: number;
  /** Days before the due date on which the client is reminded. */
  invoiceReminderDays: number[];
  /** Overdue requests: remind again every N days (0 = never). */
  overdueReminderEveryDays: number;
  /** An unpaid request is closed this many days after its due date
   * (0 = stays open). */
  invoiceExpireDays: number;
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
  processingFeePayer: 'client',
  processingFeePercent: 2.9,
  processingFeeFixedCents: 30,
  saveCards: true,
  allowInvoices: true,
  allowInstallments: true,
  maxInstallments: 12,
  feePayerMaxRounds: 5,
  invoiceReminderDays: [3, 1],
  overdueReminderEveryDays: 3,
  invoiceExpireDays: 30,
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

/** invoice = a payment request the attorney sent (amount from it). */
export const PAYMENT_KINDS = [
  'bid',
  'deposit',
  'balance',
  'custom',
  'invoice',
] as const;
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
export const FEE_PAYER_STATUSES = ['proposed', 'countered', 'agreed'] as const;
export type FeePayerStatus = (typeof FEE_PAYER_STATUSES)[number];
export const FEE_PAYER_PARTIES = ['attorney', 'client'] as const;
export type FeePayerParty = (typeof FEE_PAYER_PARTIES)[number];

export const PAYMENT_REQUEST_STATUSES = [
  'open',
  'paid',
  'canceled',
  'expired',
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

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
const intList = (
  v: unknown,
  min: number,
  max: number,
  cap: number,
): number[] | null =>
  Array.isArray(v) &&
  v.length <= cap &&
  v.every(
    (x) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max,
  )
    ? [...new Set(v as number[])].sort((a, b) => b - a)
    : null;
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
    processingFeePayer: oneOf(
      r.processingFeePayer,
      PROCESSING_FEE_PAYERS,
      // Rows saved before the three-way option: the old boolean.
      typeof r.passProcessingFeeToClient === 'boolean'
        ? r.passProcessingFeeToClient
          ? 'client'
          : 'attorney'
        : d.processingFeePayer,
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
    saveCards: bool(r.saveCards, d.saveCards),
    allowInvoices: bool(r.allowInvoices, d.allowInvoices),
    allowInstallments: bool(r.allowInstallments, d.allowInstallments),
    maxInstallments: int(r.maxInstallments, 2, 36) ?? d.maxInstallments,
    feePayerMaxRounds: int(r.feePayerMaxRounds, 0, 20) ?? d.feePayerMaxRounds,
    invoiceReminderDays:
      intList(r.invoiceReminderDays, 0, 60, 6) ?? d.invoiceReminderDays,
    overdueReminderEveryDays:
      int(r.overdueReminderEveryDays, 0, 60) ?? d.overdueReminderEveryDays,
    invoiceExpireDays: int(r.invoiceExpireDays, 0, 365) ?? d.invoiceExpireDays,
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
  /** Stripe's card fee on the whole charge at the configured rate. */
  stripeFeeEstimateCents: number;
  /** What the attorney keeps once Stripe took its fee (estimate). */
  attorneyReceivesCents: number;
  feeType: FeeType;
  feePayer: FeePayer;
  processingFeePayer: ProcessingFeePayer;
}

/**
 * The money split of one payment. The platform fee is Stripe's
 * `application_fee_amount` (moved to the platform's balance): when the
 * client pays it, it is added on top of the attorney's fee, otherwise it
 * is deducted from what the attorney receives. With direct charges Stripe
 * takes its own card fee from the ATTORNEY's balance, never the
 * platform's. `processingFeePayer` decides who ends up covering it: the
 * client (the estimate is grossed up and added to the client's total, so
 * the attorney receives ≈ the full fee), the attorney (nothing added) or
 * half each. Invariant (unit-tested): the platform's balance only ever
 * moves by `platformFeeCents ≥ 0`.
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
  const p = s.processingFeePercent / 100;
  // Gross-up: total × (1 − p) − fixed = base → total = (base + fixed) / (1 − p).
  const grossUp = Math.max(
    0,
    Math.ceil((base + s.processingFeeFixedCents) / (1 - p)) - base,
  );
  const processingFeeCents =
    s.processingFeePayer === 'client'
      ? grossUp
      : s.processingFeePayer === 'split'
        ? Math.ceil(grossUp / 2)
        : 0;
  const clientTotalCents = base + processingFeeCents;
  const stripeFeeEstimateCents = Math.round(
    clientTotalCents * p + s.processingFeeFixedCents,
  );
  const attorneyNetCents =
    s.feePayer === 'attorney' ? amountCents - platformFeeCents : amountCents;
  return {
    amountCents,
    platformFeeCents,
    processingFeeCents,
    clientTotalCents,
    attorneyNetCents,
    stripeFeeEstimateCents,
    // Stripe debits its fee from the attorney's balance, where the
    // whole charge minus the platform fee landed.
    attorneyReceivesCents: Math.max(
      0,
      clientTotalCents - platformFeeCents - stripeFeeEstimateCents,
    ),
    feeType: s.feeType,
    feePayer: s.feePayer,
    processingFeePayer: s.processingFeePayer,
  };
}
