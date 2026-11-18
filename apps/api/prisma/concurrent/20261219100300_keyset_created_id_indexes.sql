-- Row 215, second part (after #1204): the keyset lists that page by
-- (created_at DESC, id DESC) with no index starting with created_at under
-- their filter. createdBefore() (common/pagination/cursor.util.ts) turns
-- the cursor into `created_at <= t AND (created_at < t OR (created_at = t
-- AND id < x))`; with these indexes that is an Index Cond range read from
-- the cursor on, instead of a scan + sort of the whole table on every page.
-- Partial on a column that is never NULL, like the other concurrent
-- indexes, so Prisma leaves them out of its schema diff. The planner uses a
-- partial index only when the query implies its predicate: `attorney_id =
-- $1` implies `attorney_id IS NOT NULL`, and `created_at <= $1` implies
-- `created_at IS NOT NULL`. The global lists use createdKeyset(), which
-- bounds the first page by `created_at <= 9999-12-31` for that reason.
--
-- GET /cases/invites (attorney's invites, newest first): WHERE attorney_id
-- = $1 — only (client_id, created_at) existed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_invites_attorney_created_id_idx
  ON case_invites (attorney_id, created_at DESC, id DESC)
  WHERE attorney_id IS NOT NULL;
-- Admin «Журнал модерации» (moderation-appeals journal): every decision.
CREATE INDEX CONCURRENTLY IF NOT EXISTS moderation_actions_created_id_idx
  ON moderation_actions (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
-- Admin groups / channels / sticker packs: all rows (deleted and private
-- included); the discovery indexes are partial (public, not deleted).
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_groups_created_id_idx
  ON chat_groups (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS channels_created_id_idx
  ON channels (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS sticker_packs_created_id_idx
  ON sticker_packs (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
-- Admin content lists (admin-content keyset(), admin-content-extras): all
-- posts, post comments, case comments, attorney reviews, client reviews.
-- posts_visible_created_idx / posts_published_created_idx skip deleted and
-- archived posts, which the admin list shows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_created_id_idx
  ON posts (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS comments_created_id_idx
  ON comments (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_comments_created_id_idx
  ON case_comments (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS reviews_created_id_idx
  ON reviews (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS client_reviews_created_id_idx
  ON client_reviews (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
-- Admin lists with no status filter: referrals, promotions, case payments
-- (the status/user indexes start with another column).
CREATE INDEX CONCURRENTLY IF NOT EXISTS referrals_created_id_idx
  ON referrals (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_promotions_created_id_idx
  ON case_promotions (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_payments_created_id_idx
  ON case_payments (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
-- Admin «Звёзды» ledger of everyone. star_ledger_created_id_idx (verify
-- batch 1) says `WHERE id IS NOT NULL`, which no ledger query implies (the
-- cursor's `id < x` is only inside an OR), so the planner never used it:
-- EXPLAIN shows a full scan and sort. Replaced by the created_at form.
CREATE INDEX CONCURRENTLY IF NOT EXISTS star_ledger_created_at_id_idx
  ON star_ledger (created_at DESC, id DESC)
  WHERE created_at IS NOT NULL;
DROP INDEX CONCURRENTLY IF EXISTS star_ledger_created_id_idx;
