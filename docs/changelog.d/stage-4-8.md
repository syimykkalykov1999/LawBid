## Stage 4.8 — Case & bid notifications

docs/04_CASES_BIDS.md §16 stage 4.8, §13.

- Every §13 event is emitted through `NotificationsService.emit()` inside
  the transaction of the change it announces (bid_received,
  offer_countered, bid_accepted, offer_accepted, bid_rejected incl.
  `reason=withdrawn`, negotiation_failed, case_updated, case_stale_prompt,
  case_archived, completion_requested, completion_reminder, case_closed,
  contact_issue_update, moderation_notice) — a retried transaction rolls
  its row back, Idempotency-Key replays create none, jobs re-check under
  row locks / Redis claims.
- Push queue (`modules/notifications/push`): `emit()` queues a delayed job
  on the `push` BullMQ queue with jobId = notification id (at most one
  push per stored row; never fails the caller on a Redis outage).
  `case_updated` (and likes) are list-only. `PushDispatcher` (API while
  JOBS_ENABLED, always in the worker) reads the committed row (a row that
  never committed is retried, then dropped), honours
  `notification_settings.push_enabled` per category, localizes the text by
  `users.ui_language` and hands it to `PushSender` — a logging stub until
  docs/05 wires FCM (TODO(docs/05 §9.5)).
- Localized templates `notif.bids.<type>.title|body`,
  `notif.cases.<type>.title|body` (en/ru defaults in
  `notification-templates.ts`, overridable in `i18n_translations`;
  `pending_keys/stage-4-8.csv`; same keys in mobile `static_translator`).
- Fix: the §10.2 jobs now use a lean `CaseLifecycleModule`, so the worker
  process boots without HTTP-side modules (jobs e2e caught it).
- Fix (stale since stage 4.2): `onboarding.e2e-spec.ts` still expected the
  stage 1.7 `POST /cases` stub (501 / empty body); it now posts a valid
  case and checks the role/contacts gates and a real 201.

Tests: e2e `stage-4-8.e2e-spec.ts` 3/3 (full negotiation → one row per
event and recipient, retries add none; one push job per row, case_updated
not queued; ru text, disabled category, rolled-back row); full API e2e
30/30 suites (234 tests); unit 695/695.
