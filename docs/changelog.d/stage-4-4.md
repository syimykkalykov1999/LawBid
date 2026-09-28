## Stage 4.4 — Bids and negotiation (API)

docs/04_CASES_BIDS.md §16 stage 4.4, §5–§6.

- `BidsController`/`BidsService` (`apps/api/src/modules/bids`):
  `POST /cases/:caseId/bids` (create — one active-or-ever bid per attorney
  per case via UQ `bids(case_id, attorney_id)`, second attempt is
  `BID_ALREADY_EXISTS`; requires `SubscriptionAccessService.isActive()`,
  else `SUBSCRIPTION_REQUIRED`; eligibility reuses stage 4.1's
  `CaseAccessPolicy`), `POST /bids/:id/withdraw`, `POST /bids/:id/decline`,
  `POST /bids/:id/counter` (§6.1 turn-taking, 5-round cap, unavailable for
  `free_consultation`), `GET /bids/:id` (participants only, full offer
  history). Every transition goes through stage 4.1's `BidStateMachine`;
  `CaseJournalService.append()` runs in the same transaction. Bid
  acceptance (§7, contacts) stays out of scope — stage 4.5.
- `BidsService.withdrawActiveBidsForAttorney(attorneyId)`: withdraws every
  `active` bid of an attorney (§2), for the future file-06 subscription
  webhook to call directly.
- `BidSubscriptionLapseJob` (hourly, `jobs/handlers/bid-subscription-
  lapse.job.ts`): safety net until file 06 wires the real webhook —
  sweeps attorneys with active bids whose `SubscriptionAccessService.
  isActive()` has gone false (today's stub: `verification_status`
  leaving `verified`, e.g. via the nightly license-expiry job or a
  suspension) and withdraws their bids. Idempotent; no extra Redis lock
  needed (the `cron` queue runs at worker concurrency 1).
- New error codes (`ErrorCode` + mobile `ApiErrorCodes` +
  `static_translator.dart` en/ru): `SUBSCRIPTION_REQUIRED`,
  `BID_ALREADY_EXISTS`.
- `CaseAccessPolicy` is provided directly inside `BidsModule` (not via
  importing `CasesModule`) to avoid pulling `CasesController` /
  `UsersModule` / `AuthModule` / `FilesModule` into the `worker` process,
  which now also imports `BidsModule` for the lapse job.
- Tests: `test/stage-4-4.e2e-spec.ts` (creation, dedup, subscription gate,
  turn-taking, 5-round cap + `failed_negotiation`, `free_consultation`
  counter block, `GET /bids/:id` access, direct
  `withdrawActiveBidsForAttorney`, the lapse job), plus unit specs for the
  pure DTO-normalization helpers and the job's pagination.
- Translation keys added to `prisma/seed/pending_keys/stage-4-4.csv`.
- Regenerated `packages/api-contract` (openapi.json + Dart client).

Not done in this stage (left for their own stages): `GET
/cases/:id/bids` (client's bid list — needs attorney profile/rating
rendering, stage 4.3/later), `POST /bids/:id/accept` (stage 4.5's
critical transaction).
