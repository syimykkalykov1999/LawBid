-- Owner 2026-10-18: Instagram-like «Архивировать». An archived post keeps
-- its likes, comments and saves but disappears for everyone except its
-- author (feeds, profiles, search, tags, reposts, recommendations); the
-- author finds it in Settings → «Архив» and may restore it («Показать в
-- профиле») to its original place by publish date (created_at is kept).
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ;

-- The author's archive grid: newest archived first. Raw SQL partial index
-- (Prisma ignores WHERE indexes in its diff, like the other ones).
CREATE INDEX IF NOT EXISTS posts_author_archived_idx
  ON public.posts USING btree (author_id, archived_at DESC, id DESC)
  WHERE archived_at IS NOT NULL AND deleted_at IS NULL;
