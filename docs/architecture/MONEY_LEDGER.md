# Double-entry money ledger (day-one foundations, 2026-10-24)

## Резюме для владельца (по-русски, простыми словами)

**Что это.** Сейчас деньги записаны в нескольких местах (платежи, возвраты, выплаты). Мы добавили одну «бухгалтерскую книгу»: каждое движение денег записывается дважды (откуда и куда), и сумма всегда сходится. Записи нельзя менять и удалять, только добавлять новые. Каждую ночь система сверяет книгу с платежами в базе и со Stripe и присылает письмо, если что-то не сходится.

**Что меняется для людей.** Ничего. Оплата, возвраты, выплаты работают как раньше. Книга пишется в той же операции, что и сам платёж.

**Что не сделано.** Начисления (зарплата/комиссии партнёров до выплаты) пока не в книге, только фактические выплаты. Реферальные бонусы и звёзды-подарки не денежные и в книгу не входят (см. таблицу). Подробности ниже.

---

## 1. How others do it (sources)

- Stripe, [Ledger: Stripe's system for tracking and validating money movement](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement) (stripe.dev, ~2023, still the primary source): double-entry bookkeeping as the mathematical basis of correctness; an immutable, append-only record of every money movement traced through its lifecycle; reconciliation against external data is a first-class job.
- Modern Treasury, [Accounting for Developers, Part I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i) and [Ledgers overview](https://docs.moderntreasury.com/docs/ledgers-overview): three objects - account, transaction, entry; a transaction has at least two entries whose debits and credits net to zero; a posted transaction is immutable; balances are derived from entries; idempotency and concurrency control on writes. (Pages are older than 2025; no newer primary source found.)
- TigerBeetle, [Debit/Credit: the schema for OLTP](https://docs.tigerbeetle.com/concepts/debit-credit/) and [Data modeling](https://docs.tigerbeetle.com/coding/data-modeling/): only accounts and transfers; integer amounts; transfers are immutable and corrections are new reversing transfers; money is moved, never created or destroyed. Jepsen's [analysis of 0.16.11](https://jepsen.io/analyses/tigerbeetle-0.16.11) covers the consistency claims.
- Formance, [Double-entry accounting for engineers](https://www.formance.com/blog/engineering/double-entry-accounting-for-engineers-building-financial-products): practical guide; accounts as addresses, balances computed from postings, idempotency keys on transactions.
- Stripe reconciliation practice: every charge, refund and adjustment creates a *balance transaction*; payouts are matched to their component balance transactions ([guide, optimus.tech](https://optimus.tech/blog/stripe-reconciliation-guide)). Our nightly job reads exactly these.
- Not found: a 2025-2026 primary write-up from Uber or Square on their ledger design; nothing is attributed to them here.

Common pattern copied: integer minor units, immutable append-only lines, balanced entries, idempotency key per source event, derived balances, an external-counterparty account to keep entries balanced, nightly reconciliation with the processor.

## 2. Data model (migration `20261026110000_money_ledger`)

| Table | Meaning |
|---|---|
| `ledger_accounts` | `(code, owner_key, currency)` unique. `owner_key` is `platform` or the user id. `type`: asset, liability, revenue, expense, external. |
| `ledger_entries` | One money event. `(source_type, source_id, event)` is **unique = the idempotency key**. Carries `currency`, `occurred_at`, optional `stripe_ref`, `party_shard`. |
| `ledger_lines` | `entry_id`, `account_id`, `direction` (debit/credit), `amount_cents` integer > 0. |

Enforced **in the database**, not only in code (verified by hand on Postgres 16, see section 6):

- `UPDATE` / `DELETE` on all three tables raise an error (append-only). A correction is a new reversing entry. (`TRUNCATE` is not blocked: the pre-launch wipe uses it.)
- At `COMMIT` (deferred constraint trigger): each entry has >= 2 lines, debits = credits, and every line's account has the entry's currency.
- `amount_cents > 0`, currency is 3 lower-case letters.

**Shard-awareness.** The ledger is a *global-family* model (like `payments`): platform accounts and entries that touch two users cannot live inside one user shard, and the global-model rule forbids a `shard_id` column. Instead `party_shard` (smallint) stores the shard of the main user party (`hashShard(userId)`, 0 for platform-only) on accounts and entries, so reports, exports and a later move of the ledger to its own database (as Stripe does) can partition by shard. User ids are not foreign keys: the ledger outlives account anonymisation.

## 3. Chart of accounts (`ledger.chart.ts`)

Assets: `stripe_platform_balance` (mirrors Stripe's balance), `bank`. Liabilities: `tax_payable`, `stars_outstanding`, `connect_attorney` (per attorney: funds that landed in their own Connect account), `suspense` (Stripe movements nobody classified). Revenue: `revenue_subscriptions`, `revenue_bid_packs`, `revenue_promotions`, `revenue_case_fees`. Expenses: `stripe_fees`, `expense_payroll` (+ `expense_partner_commission`, `expense_referral_credit` reserved). External: `external_card_payments`, `external_stripe_processing`.

## 4. Every money flow found, and what is booked

| Flow (code) | Booked when (same DB transaction) | Entry |
|---|---|---|
| Attorney subscription invoice paid - `billing/subscription-sync.service.ts` `onInvoice` | the `payments` upsert | DR stripe_platform_balance gross; CR revenue_subscriptions (gross - tax); CR tax_payable |
| Seat purchase invoice - same path | same | same |
| Client plan / client badge - billed as subscription invoices through the same path | same | same |
| Bid pack purchase - `bid-packs.service.ts` `applyCheckout` | with `payments.create` | revenue_bid_packs |
| Stars top-up - `stars.service.ts` `applyCheckout` | with `payments.create` | CR stars_outstanding (prepaid, not revenue yet) |
| Case promotion paid - `promotions.service.ts` | with `payments.create` | revenue_promotions |
| Tax learned after the charge (Stripe Tax on card page) - `recordPaymentIntentTax` | with the `payments` update | new entry DR revenue CR tax_payable (once) |
| Admin refund of a payment - `admin-billing/refunds.service.ts` | with the `refunds` row going `succeeded` | proportional reversal of the original lines |
| Dashboard refund (`charge.refunded`) - `onRefund` | with `payments.status = refunded` | reversal of what the ledger has not seen yet |
| Client pays attorney (Stripe Connect) - `case-payments.service.ts` `applyCheckout` | with `case_payments.status = succeeded` | DR external_card_payments (total - fee); DR stripe_platform_balance fee; CR revenue_case_fees fee; CR connect_attorney net; CR external_stripe_processing rest |
| Case payment refund (attorney/admin) - `refundPayment` | with the refund row + totals | reverses with the proportional fee back |
| Dashboard refund of a case payment - `syncCharge` | with refund row + totals | reversal, fee stays (a wrong guess shows in the Stripe comparison) |
| Chargeback lost - `onDispute` | with status + refund row | reversal, fee stays, attorney bears it |
| Staff payroll transfer (includes approved partner commissions via the payroll bridge) - `admin-payroll.service.ts` `sendTransfers` | with `payroll_payouts.status = paid` | DR expense_payroll, CR stripe_platform_balance, `stripe_ref` = transfer id |
| Stripe fees, payouts to the bank, anything else on the platform balance | nightly job, by balance transaction id | fee: DR stripe_fees; payout: DR bank; other: suspense |

**Not booked (and why).**
- *Accruals* (salary and partner commissions earned but unpaid, `payroll_accruals`, `partner_commissions`, `country_partner_settlements`): no cash moved yet; booked when paid through payroll. A cash-basis ledger is the starting point; accrual accounting can be added as a second entry type without changing the tables.
- *Treasury payouts to the owner's bank* (`treasury.service.ts`): they are Stripe `payout` balance transactions; the nightly sync books them to `bank`, so booking them in the app too would double count.
- *Referral bonuses, bid credits, star gifts, rewards*: not money (free bid credits, days of plan, virtual stars). Stars are booked at purchase (`stars_outstanding`); spending them between users moves virtual currency, tracked by the existing `star_ledger`. If stars ever become cashable to attorneys, add a `stars_outstanding -> payable` entry at that event.
- *Payroll reversal of a paid payout* (`stripe.reverse`): Stripe reports it as a `transfer_refund` balance transaction, which the nightly sync books to `suspense` for review.
- Rows created before the ledger existed (there is no real data): the coverage check starts at the first entry.

## 5. Nightly reconciliation (`ledger.reconcile`, 05:15 UTC)

`LedgerReconcileService` (job `jobs/handlers/ledger-reconcile.job.ts`, Redis lock). Checks:

1. every entry balances and has >= 2 lines; every currency nets to zero;
2. coverage: every paid `payments` / `case_payments` row (after the first entry) has its entry;
3. `case_payments.refunded_cents` equals the refunds booked;
4. Stripe (only when keys are saved; dev/test skip): reads the platform balance transactions of the last 3 days (ending 2 h ago so late webhooks land), books Stripe's fees, payouts and unclassified movements idempotently, then compares the gross of the types the app books itself (charge, payment, refund, payment_refund, application_fee, application_fee_refund) with the ledger's movement on `stripe_platform_balance` over the same window. Any difference is a mismatch.

A mismatch logs `alert: ledger_mismatch` (CloudWatch metric `LedgerMismatch`, alarm in `infra/modules/monitoring/main.tf`, e-mail through the ops topic). The last result is kept in Redis for the admin view.

**Admin (read-only, no new UI):** `GET /admin/treasury/ledger` on the existing Деньги -> «Прибыль и резерв» area returns account balances and the last reconciliation. The admin web page is untouched; showing it there is a later UI task.

## 6. Verification done

- `ledger.recipes.spec.ts`: every recipe balances for many amounts, tax, partial/full refunds, rounding; full refund is the exact mirror of the charge.
- Triggers checked by hand on Postgres 16 (a throwaway database, SQL script): balanced entry commits; unbalanced, no-lines and mixed-currency entries fail at COMMIT; duplicate source is rejected; UPDATE and DELETE are rejected; zero amount rejected.
- `LedgerService` smoke run against that database: idempotent replay returns `created=false`; the sum of debits minus credits over all accounts is 0 after a charge, a partial refund and a case payment.

## 7. Risks and decisions

- The entry is written in the **same transaction** as the money event, as required. If the ledger write fails the whole event rolls back (a webhook is retried by Stripe). The recipes are pure and tested, and the database checks only reject a programming error. Payroll is the exception by design: after a successful Stripe transfer a failing ledger write never marks the payout as failed (the nightly coverage check catches it).
- The ledger services are injected `@Optional()`; a module that forgets to import `LedgerModule` posts nothing, and the nightly coverage check turns that into an alert.
- Stripe fees on case payments (direct charges) happen on the attorney's connected account and are not in the platform balance; they are only estimated as `external_stripe_processing`.
- Currencies other than USD are stored per currency; the Stripe comparison covers USD.
- Money is `Int` cents per line (max about 21.4 million dollars per line). If a single line can ever exceed that, change to `BigInt` before it does.
