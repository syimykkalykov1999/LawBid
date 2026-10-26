import type { LedgerAccountType } from '@prisma/client';

/**
 * Chart of accounts of the money ledger (docs/architecture/MONEY_LEDGER.md).
 * Normal balance: asset / expense / external = debit; liability / revenue =
 * credit. `external` accounts are the counterparties outside our books
 * (card holders, Stripe's processing cut, the bank): they make every entry
 * balance without pretending we hold that money.
 *
 * Per-user accounts (ownerId set): connect_attorney, partner_payable ...
 * Everything else belongs to the platform (owner_key = 'platform').
 */
export const CHART = {
  // --- assets
  /** What Stripe holds for the platform account (mirrors Stripe's balance). */
  stripe_platform_balance: 'asset',
  /** Money moved out to the owner's bank (Stripe payouts). */
  bank: 'asset',
  // --- liabilities
  /** Sales tax collected for the tax authorities. */
  tax_payable: 'liability',
  /** Prepaid stars not yet spent (real money received, virtual currency out). */
  stars_outstanding: 'liability',
  /** Funds that landed in an attorney's own Stripe connected account (per user). */
  connect_attorney: 'liability',
  /** Stripe movements the app did not classify (transfers, adjustments): to review. */
  suspense: 'liability',
  // --- revenue
  revenue_subscriptions: 'revenue',
  revenue_bid_packs: 'revenue',
  revenue_promotions: 'revenue',
  revenue_case_fees: 'revenue',
  // --- expenses
  stripe_fees: 'expense',
  expense_payroll: 'expense',
  expense_partner_commission: 'expense',
  expense_referral_credit: 'expense',
  // --- external counterparties
  external_card_payments: 'external',
  external_stripe_processing: 'external',
} as const satisfies Record<string, LedgerAccountType>;

export type LedgerAccountCode = keyof typeof CHART;

export const PLATFORM_OWNER = 'platform';

export interface AccountRef {
  code: LedgerAccountCode;
  /** The user the account belongs to; omitted = a platform account. */
  ownerId?: string;
}

export const typeOf = (code: LedgerAccountCode): LedgerAccountType =>
  CHART[code];
