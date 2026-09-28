## Stage 4.1: Migration, state machines, journal — docs/04 §10, §5–§7, §14, §16 — 2026-09-27

**Migration `20260927230000_stage_4_1_case_journal_attorney`** (the only
schema migration of file 04; generated with `prisma migrate diff` against the
dev DB, raw SQL appended)
- §14: `case_journal.attorney_id uuid?` (FK → users, RESTRICT) + index
  `(attorney_id, created_at)`; `notification_type` + `case_updated`
  (category `cases`, docs/05 §9.2); `app_config`
  `contacts.suspend_after_confirmed_reports = 3` (INSERT … ON CONFLICT DO
  NOTHING; also in `FILE_04_SETTINGS` / seed / `AppSettingsService`).
- `lawbid_app` stays INSERT/SELECT-only on `case_journal` (re-asserted; no new
  tables).
- Job indexes from the file-03 DB review: `attorney_licenses(license_status,
  expires_at)` (license-expiry job), `cases(status, closed_at)`
  (review-reminder job), `reports(target_type, target_id, status)`,
  `reports(reporter_id)`.

**Domain (apps/api)**
- `CaseStateMachine` (`modules/cases/domain`): §10.1 table (+ in-place
  `client_edit` / `client_keep_alive` / `client_delete` only in the statuses
  §3.5/§10.2 allow); pure `planCaseTransition` + guarded `apply(tx, …)`
  (compare-and-set on status; 409 `CASE_INVALID_STATE`, 404
  `CASE_NOT_FOUND`). `client_restore` also resets `stale_prompt_sent_at` so
  the §10.2 reminder can fire again.
- `BidStateMachine` (`modules/bids/domain`): §6.3 counter / accept / decline /
  withdraw (+ system `auto_reject`, `system_withdraw`); bid row locked `FOR
  UPDATE` for negotiation actions; writes the matching `bid_offers` step
  (`OfferStateMachine`, `modules/negotiations`: pending → accepted / declined /
  countered / superseded). `applyToActive` for "reject every other active
  bid" / "withdraw an attorney's bids".
- `CaseJournalService.append(tx, …)` (`modules/journal`): the only
  case_journal writer; per-case serialization by `SELECT … FOR UPDATE` on the
  `cases` row; `row_hash = SHA-256(prev_hash + canonical JSON of the row)`,
  strictly increasing `created_at` per case, `retain_until = created_at + 5
  years`. `verifyChain(caseId)` reports `hash_mismatch` / `link_mismatch`.
- `CaseAccessPolicy` (deny by default): owner client; attorney with a bid or
  conversation; otherwise the §4.1/§5.4 predicate (verified attorney, verified
  license in a case state, practice match incl. the General Practice / Not
  Sure exception). Attorney access never includes client identity.
- `SubscriptionAccessService.isActive()` stub (verified attorney = active)
  until docs/06 stage 6.7.
- Error codes: `CASE_NOT_FOUND`, `CASE_INVALID_STATE`, `BID_INVALID_STATE`,
  `BID_NOT_YOUR_TURN`, `BID_MAX_ROUNDS_REACHED`, `BID_COUNTER_NOT_ALLOWED`
  (mobile `ApiErrorCodes`, en/ru texts, `pending_keys/stage-4-1.csv`,
  regenerated contract).

**Tests**: exhaustive unit tables (case 6×13, bid 3888 combinations, offer
5×5), journal/policy/subscription units; `test/stage-4-1.e2e-spec.ts`
(rollback together, chain under concurrent appends as `lawbid_app`, tamper
edit/delete detected, `lawbid_app` UPDATE/DELETE denied, full negotiation +
accept, policy SQL).
