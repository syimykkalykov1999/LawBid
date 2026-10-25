---
status: "accepted"
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

- Integer cents plus append-only ledger rows with idempotency keys and a hash-chained case journal (chosen)
- Mutable balance columns only
- Full double-entry accounting tables

## Decision outcome

Money is integer cents (`.cursorrules`). `star_ledger` records every balance change
(`delta`, `balance_after`, unique `idem_key`, no FK to users so it outlives accounts;
balance never below 0 by CHECK). `case_journal` is append-only and hash-chained per
case; entries are written only through `CaseJournalService.append()` in the same
transaction as the change. Stripe is the source of truth for real money; the
treasury and payroll jobs read Stripe balances and split by rule.

### Consequences

- Good: replays are no-ops; the chain makes tampering detectable (alarm `journal-integrity`).
- Bad: this is a single-entry ledger with idempotency, **not** a debit/credit double-entry book. If accounting needs one, that is a new ADR.
- Confirmation: `case-journal.service.spec.ts`, `journal-integrity` runbook, `treasury.service.spec.ts`.

## More information

`apps/api/prisma/schema.prisma` (StarLedger, CaseJournal), [journal-integrity.md](../runbooks/journal-integrity.md), [treasury.md](../runbooks/treasury.md). Back-filled 2026-10-25; the request to document a "double-entry ledger" was checked against the code and the code does not do double entry.
