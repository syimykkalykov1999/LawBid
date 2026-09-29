## Stage 5.8 — Notifications, push, badges (API)

docs/05 §16 stage 5.8, §9, §10, §15 "Уведомления и push".

- `NotificationsService.emit` (single entry point): stores the row and
  aggregates `post_like`, `comment_like`, `new_follower` per object and
  hour (`dedupe_key` on the partial UQ, `aggregate_count`, latest actor,
  back to unread and to the top). `new_message` is never stored — it only
  queues its push.
- Delivery (`push` queue, after commit): realtime `notification:new` +
  `badge:update`; push only for the first row of an aggregate and push
  types; category settings with `system` locked on; quiet hours defer the
  job to their end (per the user's time zone, across midnight;
  `security_new_device` exempt); chat pushes skipped while muted or while
  the chat is open on a device (`rt:view:*`); email for `system` types
  (once per row; `security_new_device` stays with the auth email channel).
- FCM HTTP v1 sender (google-auth-library), chosen automatically when
  `FCM_*` env is set; one send per device per logical push (retries skip
  served devices), `UNREGISTERED`/invalid tokens deleted, 4 attempts with
  exponential backoff. Tokens bound to the session chain: sign-out stops
  pushes.
- REST: `GET /notifications` (actor: attorney by profile, client as
  "Anna K."), `POST /notifications/read {ids|all}`, `GET /badges`,
  `GET/PUT /notification-settings`, `PUT /notification-settings/quiet-hours`,
  `POST/DELETE /push-tokens`.
- Badges (§10): Redis hash per user (chats, notifs), +1 on a message,
  recount on reads/notifications, rebuilt from the DB when missing and at
  least daily (TTL). `new_message` is not a row, so never counted twice.
- Push templates en/ru for messages, social and system types; the auth
  new-device push leg now emits `security_new_device`.
- Cron `notifications.retention` (04:40 UTC): deletes rows older than
  `notifications.retention_days` in batches.
- Email provider factory shared by auth and notifications (same selection).

Tests: e2e `stage-5-8.e2e-spec.ts` 6/6; stage 4.8 queue assertion updated
(list-only rows are queued with `push: false`); files e2e moved to its own
phone range (collided with profiles-practices); unit `notification-rules`.
Full unit 715/715, full e2e 39 suites / 270 tests green.
