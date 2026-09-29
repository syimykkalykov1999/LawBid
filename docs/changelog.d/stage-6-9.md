## Stage 6.9 — Privacy and data lifecycle

docs/06_PRODUCTION.md §13 stage 6.9, §5.1–5.3.

### API (`modules/privacy`, jobs)
- Anonymization (§5.1): daily `privacy.anonymize` takes every
  `deletion_pending` user whose request is older than 14 days. External
  side effects first and idempotent (Stripe subscription canceled
  immediately through `PaymentProvider.cancelNow`; avatar and verification
  files removed from S3), then the cases still in work are closed with a
  journal event (`account_deleted_close`, new state-machine action from
  `in_progress` / `pending_completion` / `disputed`; the counterpart gets
  `case_closed`), a client's open cases are archived with bids
  `rejected_auto`, and one transaction scrubs the user: `Deleted User`,
  email/phone null, identifiers and push tokens gone, sessions revoked
  (+ access-token blacklist), `status = deleted`, `anonymized_at`, files
  `deleted_at`; attorney → `deleted_<id>`, bio/firm cleared, profile
  suspended, active bids withdrawn, posts `removed`; own messages become
  `[deleted]`. `case_journal`, `contact_disclosures`, `auth_events`,
  `user_consents`, `audit_log` are untouched.
- Data export (§5.2): `POST /users/me/data-export` (reauth) → row in
  `data_export_jobs` (`user_data`), BullMQ queue `data-export` (jobId =
  row id, atomic claim so a retry never builds two ZIPs); the worker
  writes JSON files (profile, consents, devices, cases, bids, posts,
  comments, likes, own messages) into one ZIP in the private documents
  bucket, records the `files` row (`purpose = data_export`), sets
  `expires_at = +24 h`, emits `data_export_ready` and emails the signed
  link. `GET /users/me/data-export/:id` returns the status and a fresh
  link while it is ready. The case-history PDF export now also records
  its `data_export_jobs` row (`case_history_pdf`).
- Journal (§5.3): monthly `journal.retention` removes `case_journal`
  rows past `retain_until` in batches, on `RETENTION_DATABASE_URL`
  (the `lawbid_retention` role; falls back to the app connection with a
  warning when unset). Daily `journal.chain-verify` recomputes the chain
  for every case with rows from the last 24 h plus 200 random cases; a
  break is a fatal log + Sentry `fatal`. A head row whose predecessor was
  removed by retention is accepted only when the head itself is older
  than four years (`trimmedHeadAllowed`).
- Cleanup (§5.3): daily `exports.cleanup` expires ready exports past
  `expires_at` (S3 object removed, `files.deleted_at`, status `expired`)
  and fails jobs stuck for a day.
- Migration `20260929200000_stage_6_9_privacy`: `file_purpose.data_export`,
  `notification_type.data_export_ready`. Env `RETENTION_DATABASE_URL`.

### Tests
- Unit: state machine (15 actions, `in_progress → closed`), journal
  trimmed head, cron registry (19 schedules).
- e2e `stage-6-9`: anonymized attorney has no name/email/phone/files and
  the journal (with one more `closed` event) stays valid; client's open
  case archived + bid `rejected_auto`; export needs reauth, one job in
  flight per user, ZIP behind a signed link, `data_export_ready`,
  expiry drops link and object; retention removes only rows past
  `retain_until`; a forged payload is reported as `hash_mismatch`.
