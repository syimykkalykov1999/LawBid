## Owner 2026-10-05 — Storage like Telegram

Files and the database do not grow out of control; everything runs by
itself (switches on by default in admin Система → Хранилище).

### API
- Deduplication: identical uploads (same `source_sha256`, bucket and
  processing profile) share one S3 object, decided in the scan job;
  `files.s3_key` is no longer unique. `copyForUser` shares instead of
  copying. Objects are removed only when no live row uses them
  (`FileReleaseService`, refcount by query); account anonymization and the
  task archive purge now go through it and also remove size variants.
- Cleanup (`storage.gc`, hourly): presigned uploads never confirmed
  (Redis `files:pending`), files nothing references (`FILE_REFERENCES`,
  guarded by a DMMF unit test) after `storage.orphan_grace_hours`, media of
  posts deleted `storage.deleted_posts_media_days` ago → set aside, purged
  after `storage.purge_after_days` with a recheck. Identity documents,
  exports and video are exempt.
- WebP for processed photos and avatars (`storage.image_format`).
- Caps: `storage.user_quota_mb` (personal override `users.storage_quota_mb`)
  → `STORAGE_QUOTA_EXCEEDED` at presign; `storage.chat_quota_mb` →
  `CHAT_STORAGE_FULL` on send. `GET /conversations/:id/storage`.
- Retention (`storage.retention`, nightly): `auth_events` (through
  `lawbid_retention`), `assistant_activity`, `storage_snapshots`.
- `storage.snapshot` (nightly): `storage_snapshots` row per day; logs
  `alert: storage_growth` above `storage.growth_alert_percent`.
- Admin: `GET /admin/storage`, `PUT /admin/storage/settings`,
  `POST /admin/storage/cleanup`, `PUT /admin/storage/users/:id/quota`.

### Admin
- Система → «Хранилище»: usage by type, dedup savings, pending removal,
  biggest tables, top users with per-user caps, daily growth, switches.

### App
- Texts for both cap errors; the chat «Файлы» screen shows counts and how
  much the chat's files take.

### Infra
- Documents bucket: Intelligent-Tiering for objects over 128 KB.
- CloudWatch `storage_growth` metric filter + alarm.
