---
status: "accepted"   # amended 2026-10-25: double-entry money ledger added (PR #335)
date: 2026-10-05
decision-makers: owner
---

# Money in integer cents; append-only ledgers and journals

## Context and problem statement

Money, stars (in-app balance) and case events are records that must be provable,
retry-safe and must outlive accounts. How do we store them?

## Decision drivers

- No float rounding; no lost or doubled money on webhook retries or double taps.
- Disputes and legal retention (case journal kept 5 years).
- Rows must not be edited after the fact.

## Considered options

- Integer cents plus append-only ledger rows with idempotency keys and a hash-chained case journal (chosen 2026-10-05)
- Mutable balance columns only
- Full double-entry accounting tables (added 2026-10-25 for real money, see below)

## Decision outcome

Money is integer cents (`.cursorrules`). `star_ledger` records every balance change
(`delta`, `balance_after`, unique `idem_key`, no FK to users so it outlives accounts;
balance never below 0 by CHECK). `case_journal` is append-only and hash-chained per
case; entries are written only through `CaseJournalService.append()` in the same
transaction as the change. Stripe is the source of truth for real money; the
treasury and payroll jobs read Stripe balances and split by rule.

### Consequences

- Good: replays are no-ops; the chain makes tampering detectable (alarm `journal-integrity`).
- Bad (until 2026-10-25): `star_ledger` and `case_journal` are single-entry with idempotency, not a debit/credit book.
- Confirmation: `case-journal.service.spec.ts`, `journal-integrity` runbook, `treasury.service.spec.ts`.

### Amendment 2026-10-25: double-entry money ledger (PR #335)

Real money now also has a double-entry book: tables `ledger_accounts`, `ledger_entries`,
`ledger_lines` (migration `20261026110000_money_ledger`). Integer cents; rows are
append-only (UPDATE/DELETE blocked by triggers); every entry must balance at COMMIT
(deferred constraint trigger); idempotent by `(source_type, source_id, event)`;
`party_shard` kept for later splits; global family. Entries are booked in the same
transaction as the money event (subscription invoices, bid packs, stars top-ups,
promotions, tax, admin refunds, case payments and refunds/chargebacks, payroll transfers).
A nightly `ledger.reconcile` job checks balance, coverage and Stripe balance transactions
and raises `alert: ledger_mismatch` (CloudWatch alarm in Terraform). Read-only
`GET /admin/treasury/ledger`. Stripe stays the source of truth for cash; the book is the
provable copy. Accruals (unpaid salary/commissions) are not booked yet — cash basis.
Design and every flow: [MONEY_LEDGER.md](../architecture/MONEY_LEDGER.md).
`star_ledger` and `case_journal` keep their single-entry design (stars are an in-app balance,
the journal is an event log), so both parts of this ADR stay in force.

## More information

`apps/api/prisma/schema.prisma` (StarLedger, CaseJournal), [journal-integrity.md](../runbooks/journal-integrity.md), [treasury.md](../runbooks/treasury.md). `apps/api/src/modules/ledger/` (double-entry book, PR #335). Back-filled 2026-10-25, amended the same day when #335 landed.
