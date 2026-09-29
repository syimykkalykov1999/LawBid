## Stage 6.4 — Moderation

docs/06_PRODUCTION.md §13 stage 6.4, §3.

### API
- `RuleBasedModerationHook` replaces the file-05 stub behind
  `CONTENT_MODERATION_HOOK` (§3.3, no external AI): `moderation.blocked_terms`
  → block (`422 CONTENT_BLOCKED` on posts and comments), `moderation.hold_terms`
  → hold (stored as `hidden`), ≥ `moderation.max_links` (3) links → hold,
  the same normalized text from one author within
  `moderation.duplicate_window_hours` (24) → hold (Redis counter; Redis
  down = rule skipped). Whole-word matching after NFKC/lower-case
  normalization. New `app_config` keys seeded with `FILE_06_SETTINGS`.
- `ModerationService` (global): resolves a report target (post, comment,
  message, review, case, user → author, status, text, context) and applies
  hide / remove / restore with the same side effects as the owners' own
  paths — `posts_count` / `comment_count` / `reply_count` bumps, attorney
  rating recalculation for reviews (file 03 §7.5), `deleted_at` for a
  message (OQ-B). `autoHideIfThreshold`: `moderation.auto_hide_reports`
  (3) distinct reporters with an open or actioned report hide the object
  (OQ-C); called after `POST /reports` and `POST /reviews/:id/report`.
- `/admin/moderation` (super_admin, moderator): `GET queue` — reports
  grouped by object (count, distinct reporters, reasons, first/last
  report, current object status, excerpt, author with warning/suspension
  counts), oldest first, keyset cursor, filters status / targetType;
  `GET targets/:type/:id` — object + context, all reports, author, the
  author's history (sanctions and actions on their content),
  `availableActions`; `POST targets/:type/:id/actions` — `hide`, `remove`,
  `warn`, `suspend`, `restore`, `dismiss`, reason required: open reports
  → `actioned` / `dismissed` with `handled_by`, a `moderation_actions` row
  (except dismiss), an audit row with before/after, `moderation_notice` to
  the author except for dismiss; `warn` / `suspend` / user `restore` reuse
  `AdminUsersService` (§3.4). Non-applicable actions → `409
  MODERATION_ACTION_NOT_APPLICABLE`.
- Contract regenerated.

### apps/mobile
- `Post.status` from the contract; the author sees "Пост на проверке" /
  "Post under review" on their own hidden post (§3.3).

### apps/admin
- `/moderation` queue (status / object filters, grouped rows with reporter
  counts and author warnings) and `/moderation/[type]/[id]` card with the
  object text, context ids, author + history, the reports table and the
  action buttons (each through the reason dialog).

### Tests
- Unit: `RuleBasedModerationHook` (normalization, whole-word terms, links,
  duplicates per author, zero thresholds).
- e2e `stage-6-4.e2e-spec.ts`: blocked term → 422 on post and comment,
  hold term / links / duplicate → `hidden`; 3 distinct reporters hide a
  post (gone from profile, search and a follower's feed; `posts_count`
  follows) and the queue shows the grouped row; 3 reports hide a review
  and recalculate the rating; moderator card + hide/restore/hide (409 on
  repeat)/warn/dismiss/remove with reports, notices and the audit trail;
  support is 403; comment hide keeps `comment_count` in sync; message
  hide sets `deleted_at`.
