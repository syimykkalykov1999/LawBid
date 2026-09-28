## Stage 3.7: Reviews (API) — docs/03 §7, §9 — 2026-09-27

**API (`modules/reviews`)**
- `POST /cases/:caseId/review` (client): the case must belong to the caller,
  be `closed` and have an `accepted` bid; the review is tied to that bid's
  attorney. One review per case (409 `REVIEW_ALREADY_EXISTS`, also for a
  concurrent UQ violation). `Idempotency-Key` is **required** here
  (`RequireIdempotencyKeyGuard` → 400 `IDEMPOTENCY_KEY_REQUIRED`) and
  replayed by `IdempotencyInterceptor`.
- `PATCH /reviews/:id` (author): within `review.edit_window_days` (default 14)
  of creation, only while `published`; sets `edited_at`. No delete endpoint.
- `GET /attorneys/:id/reviews` — published only, newest first, keyset cursor
  (`meta.nextCursor`, `limit` 1..50, default 20). Public shape: no case id,
  no client id/avatar; reviewer shown as "Anna K." (`authorDisplayName`).
  404 for a missing, deleted or suspended attorney.
- `GET /attorneys/:id/reviews/summary` — `ratingAvg` (1 decimal, null when no
  reviews), `ratingCount`, `distribution` 5→1.
- `POST /reviews/:id/report` (reviewed attorney only) — `reports` row
  (`target_type = review`, status `open`); repeating while open returns the
  same report.
- Rating: `attorney_profiles.rating_avg/rating_count` recalculated by one SQL
  statement inside the same `withTxRetry` transaction on create, edit and
  moderation (`review-rating.ts`).
- `ReviewModerationService.setStatus` (for file 06): hide / remove / restore,
  recalculation and an `audit_log` row in one transaction. No HTTP route yet.
- `ReviewsService.requestReview` (for file 04's case closing): emits
  `review_requested` to the client.

**Notifications seam** — `modules/notifications`: `NotificationsService.emit
({type, recipientId, payload}, tx?)` persists a `notifications` row with the
docs/05 §9.2 category (`new_message` is never stored). `review_received` goes
to the attorney in the create transaction. File 05 adds settings, dedupe,
realtime, push and email behind the same method.

**Jobs (`cron` queue)**
- `reviews.reminder` (daily 16:00 UTC): one `review_requested` reminder
  (`payload.reminder = true`) for cases closed `review.reminder_after_days`
  (default 7) to +3 days ago, with no review and no earlier reminder.
- `reviews.rating-reconcile` (nightly 04:15 UTC): recomputes rating counters
  with the same SQL expression and fixes drift (§7.5).
- The worker process now imports `AppSettingsModule`.

**Error codes (API + app, en/ru)**: `REVIEW_CASE_NOT_CLOSED`,
`REVIEW_NO_ACCEPTED_BID`, `REVIEW_ALREADY_EXISTS`,
`REVIEW_EDIT_WINDOW_EXPIRED`, `REVIEW_NOT_EDITABLE` (all 409). Keys in
`apps/api/prisma/seed/pending_keys/stage-3-7.csv`.

**Contract**: `openapi.json` and the Dart client regenerated
(`ReviewsClient`, review DTOs, `ReportReason`, `ReviewStatus`).

**Notes**: no schema change. There is no `cases(status, closed_at)` index, so
the reminder sweep scans closed cases; file 04 owns that table's indexes.
