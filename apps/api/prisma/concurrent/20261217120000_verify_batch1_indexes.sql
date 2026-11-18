-- Verify 17.11, batch 1 (comments, likes/stars, posts and feed).
-- Partial (on a column that is never NULL), like the other concurrent
-- indexes, so Prisma leaves them out of its schema diff; every query below
-- compares the column with a value, so the planner uses them.
--
-- GET /posts/:id/likes (post-engagement.service likers): WHERE post_id = $1
-- ORDER BY created_at DESC, user_id DESC. Only the primary key
-- (post_id, user_id) existed: each page read and sorted EVERY like of the
-- post (a viral post = a sort of all its likes per page).
CREATE INDEX CONCURRENTLY IF NOT EXISTS post_likes_post_created_user_idx
  ON post_likes (post_id, created_at DESC, user_id DESC)
  WHERE post_id IS NOT NULL;
-- GET /posts/:id/reposts: WHERE post_id = $1 ORDER BY created_at DESC, id
-- DESC — only (post_id) existed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS post_reposts_post_created_id_idx
  ON post_reposts (post_id, created_at DESC, id DESC)
  WHERE post_id IS NOT NULL;
-- One photo belongs to one post (posts.service createPost already says so,
-- «This photo is already used in another post»), but the check ran before
-- the transaction with no unique key: two parallel creates with the same
-- photo both won, and deleting one post cleaned the file the other showed.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS post_media_file_id_one_post_key
  ON post_media (file_id)
  WHERE file_id IS NOT NULL;
-- GET /admin/stars/ledger with no user: ORDER BY created_at DESC, id DESC
-- over the whole star_ledger — only (user_id, …) and (kind, …) existed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS star_ledger_created_id_idx
  ON star_ledger (created_at DESC, id DESC)
  WHERE id IS NOT NULL;
