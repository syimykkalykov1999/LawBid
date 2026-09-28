## Stage 4.2: Case creation and management — docs/04 §3, §11.1, §15, §16 — 2026-09-27

**API (apps/api)**
- `CasesController` (`modules/cases`) replaces the stage-1.7 `POST /cases`
  stub: `POST /cases`, `PATCH /cases/:id`, `POST /cases/:id/close`,
  `DELETE /cases/:id`, `POST /cases/:id/restore`,
  `POST /cases/:id/keep-alive`, `GET /users/me/cases?filter=&cursor=`.
  `CasesService` is the single implementation behind them; every status
  change goes through `CaseStateMachine.apply()` (4.1) inside `withTxRetry`,
  every mutation appends a `case_journal` row via
  `CaseJournalService.append()` in the same transaction.
- §3.1–§3.4 validation: title 10-120, description 30-5000, city ≤80,
  practice area must be an active leaf (specialization, not a category),
  primary + up to 2 additional states via `validateCaseStates` (4.1) plus a
  DB existence/active check; budget entered in whole dollars, stored in
  cents (`budgetCentsOf`, `.cursorrules` "Деньги только в центах").
- `contact-detector.ts`: regex-based phone/email/link detection for
  title/description/city (`CASE_CONTAINS_CONTACT_INFO`, 400), with
  normalization for spelled-out digits (en/ru) and "at"/"dot" (en/ru,
  "собака"/"точка") email obfuscation — Unicode-aware word boundaries
  (`\p{L}`/`\p{N}` lookaround) since `\b` doesn't bound Cyrillic in JS.
- `client_contact_sharing` consent gate: `POST /cases` checks the latest
  `user_consents` row for the type; if never granted, the request must
  carry `clientContactSharingConsent: true` (else 403
  `CLIENT_CONTACT_SHARING_CONSENT_REQUIRED`) and the consent row is written
  in the same transaction as the case. Later cases don't need the flag
  again.
- §3.5 edit: practice area / states are rejected (409 `CASE_INVALID_STATE`,
  `details.reason = 'bids_exist'`) once `bids_count > 0`; other fields stay
  editable. A state-only or practice-only patch merges with the case's
  current other half (client doesn't have to resend the unchanged side).
  Every changed field is diffed into the `updated` journal payload
  (`{old, new}`); attorneys with an `active` bid get a `case_updated`
  notification when bids exist and something actually changed.
- Close/delete auto-reject every `active` bid via
  `BidStateMachine.applyToActive()` (4.1), journal `bid_rejected` per bid
  (`payload.reason` = `case_closed` / `case_deleted`) and notify each
  attorney; delete only from `open`/`archived` (`in_progress` etc. get 409
  via the state machine's transition table, no extra guard needed).
  Restore resets `stale_prompt_sent_at` too (so the §10.2 stale job can
  fire again); keep-alive is the same in-place action as "Да, актуален".
- `GET /users/me/cases`: cursor pagination (`meta.nextCursor`,
  `(created_at, id)` keyset), `filter=active|archived|closed` maps to the
  §10.1 status groups; soft-deleted cases are hidden by the existing
  soft-delete Prisma extension, no explicit filter needed.
- New error codes: `CASE_CONTAINS_CONTACT_INFO`,
  `CLIENT_CONTACT_SHARING_CONSENT_REQUIRED` (mobile `ApiErrorCodes`, en/ru
  texts in `static_translator.dart` + `api_error_text.dart`,
  `pending_keys/stage-4-2.csv`, regenerated OpenAPI + Dart client). Renamed
  `CasesController` handler methods (`createCase`, `updateCase`, ...) to
  avoid an operationId collision with `ReviewsController`'s `create`/
  `update` (Nest's operationId = method name only, must be unique
  process-wide).

**Tests**
- Unit: `contact-detector.spec.ts` (email/link/phone incl. spelled-out
  en/ru and obfuscated email, plus negative cases: abbreviations, scattered
  numbers); `cases.service.spec.ts` (`budgetCentsOf`).
- e2e (`test/stage-4-2.e2e-spec.ts`, real CockroachDB/Redis): no case
  without verified contacts or the contact-sharing consent (and the
  consent isn't asked for again); >3 states / duplicate state / short
  description / contact info in text / unknown state / non-leaf practice
  all rejected, nothing persisted; Idempotency-Key required and replay-safe
  on create; edit blocks practice/state changes once a bid exists but
  keeps other fields editable and notifies bidders; close/delete
  auto-reject and notify; delete blocked on `in_progress`; restore resets
  the stale-prompt flag; keep-alive works only on `open`; `GET
  /users/me/cases` filters, paginates, and excludes other clients' and
  deleted cases.
