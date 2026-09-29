## Stage 5.1 — Migration, counters, foundation

docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §16 stage 5.1, §12–§14.

- Migrations (§14): `stage_5_1_file_purpose_post_video` (own file:
  CockroachDB can't use a new enum value in the adding transaction) and
  `stage_5_1_feed_chat_notifications` — `posts.edited_at`,
  `notifications.dedupe_key` + `aggregate_count` (default 1), partial UQ
  `(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`, app_config
  `rate_limit.*` (§13) and `notifications.retention_days` = 180.
- `CounterAggregator` (`modules/counters`, global): bumps go to Redis
  pending hashes (+ "touched today" set) in one EVAL; one flusher across
  pods every 10 s applies each counter in one multi-row UPDATE (deltas put
  back on DB failure); reads can overlay pending deltas; nightly
  `counters.reconcile` job recomputes touched posts / comments /
  attorney profiles from the source tables.
- `UsageLimitsService` (`common/usage-limits`): §13 per-user fixed-window
  limits from app_config → 429 `RATE_LIMITED`.
- `ContentModerationHook` seam with the `allow` stub (§12.2, docs/06
  replaces it). `post_video` uploads answer `FEATURE_DISABLED` while the
  `video_posts` flag is off (§3.6).
- Error codes (API enum, mobile `ApiErrorCodes`, en/ru,
  `pending_keys/stage-5-1.csv`): POST_NOT_FOUND, POST_NOT_ALLOWED,
  COMMENT_NOT_FOUND, FOLLOW_NOT_ALLOWED, CONVERSATION_NOT_FOUND,
  CONVERSATION_CLOSED, MESSAGE_TOO_LONG, FEATURE_DISABLED,
  SEARCH_QUERY_TOO_SHORT.

Tests: e2e `stage-5-1.e2e-spec.ts` 3/3 (flush to DB, reconcile fixes
drift, 429 past the limit); unit jobs/files green; flutter test 591/591.
