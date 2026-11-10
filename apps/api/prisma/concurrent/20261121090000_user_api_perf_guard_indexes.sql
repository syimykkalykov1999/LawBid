-- Perf guard of the user-facing API 2026-11-08 (test/perf-user.e2e-spec.ts,
-- docs/perf/USER_API_PERF_GUARD_2026-11-08.md): pages that at 10M / 100M rows
-- sorted a whole table to show the first few rows. Each index gives the
-- query its ORDER BY with the query's own predicate, so the LIMIT stops
-- after one page. Partial, like the other concurrent indexes, so Prisma
-- leaves them out of its schema diff.
--
-- People suggestions (recommendations.service.ts attorneys): the top-rated
-- and the newest verified attorneys.
CREATE INDEX CONCURRENTLY IF NOT EXISTS attorney_profiles_verified_rating_idx
  ON attorney_profiles (rating_avg DESC, followers_count DESC, user_id)
  WHERE verification_status = 'verified';
CREATE INDEX CONCURRENTLY IF NOT EXISTS attorney_profiles_verified_newest_idx
  ON attorney_profiles (verified_at DESC NULLS LAST, user_id)
  WHERE verification_status = 'verified';
-- Groups to join (recommendations.service.ts groupRows): the biggest and
-- the newest public groups.
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_groups_discover_members_idx
  ON chat_groups (member_count DESC, created_at DESC)
  WHERE group_type = 'public' AND deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_groups_discover_newest_idx
  ON chat_groups (created_at DESC)
  WHERE group_type = 'public' AND deleted_at IS NULL;
-- Channels to subscribe to (channelRows): the biggest and the newest.
CREATE INDEX CONCURRENTLY IF NOT EXISTS channels_discover_subscribers_idx
  ON channels (subscriber_count DESC, created_at DESC)
  WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS channels_discover_newest_idx
  ON channels (created_at DESC)
  WHERE status = 'active' AND deleted_at IS NULL;
