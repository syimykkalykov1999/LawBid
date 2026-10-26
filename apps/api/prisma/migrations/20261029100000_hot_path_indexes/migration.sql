-- Owner 2026-10-25 (DB audit, package N-12a): indexes for the hot paths
-- found in the query-vs-index audit, plus the foreign-key columns that
-- grow with traffic and had no index (a delete of the parent row or a
-- "mine" lookup scanned the table).
--
--  * follows: the followers / following / feed / stories lists read
--    "newest first" with a keyset on (created_at, other id).
--  * conversations.bid_id: bid accept / reject finds its chat.
--  * messages (conversation_id, created_at DESC, id DESC): the chat page,
--    the unread counter and the keyset; it replaces the shorter
--    (conversation_id, created_at DESC) index (same leading columns, so
--    every query of the old one is served by the new one).
--  * messages media tab, comments page, public attorney directory, popular
--    posts: each had a sort without an index.
--
-- Plain CREATE INDEX IF NOT EXISTS: Prisma runs a migration in one
-- transaction, where CONCURRENTLY is not allowed (same as
-- 20261022190100_client_economy_case_sync_indexes). The tables are small
-- at this stage; when the online-DDL runner (prisma/concurrent) is on main,
-- later index builds of big tables go there. Partial indexes
-- (conversations_bid_id_idx, messages_media_idx, posts_popular_idx) are raw
-- SQL only: Prisma does not model them (like messages_expiry_idx).

CREATE INDEX IF NOT EXISTS follows_followee_created_follower_idx
  ON public.follows (followee_id, created_at DESC, follower_id DESC);

CREATE INDEX IF NOT EXISTS follows_follower_created_followee_idx
  ON public.follows (follower_id, created_at DESC, followee_id DESC);

CREATE INDEX IF NOT EXISTS conversations_bid_id_idx
  ON public.conversations (bid_id)
  WHERE bid_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_conv_created_id_idx
  ON public.messages (conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS messages_media_idx
  ON public.messages (conversation_id, created_at DESC)
  WHERE type IN ('attachment', 'voice');

CREATE INDEX IF NOT EXISTS comments_post_created_id_idx
  ON public.comments (post_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS attorney_profiles_directory_idx
  ON public.attorney_profiles (trust_level DESC, rating_avg DESC, username_lower);

CREATE INDEX IF NOT EXISTS posts_popular_idx
  ON public.posts (like_count DESC, comment_count DESC, created_at DESC, id DESC)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Foreign keys without an index (growth tables first).
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments (author_id);
CREATE INDEX IF NOT EXISTS comment_likes_user_id_idx ON public.comment_likes (user_id);
CREATE INDEX IF NOT EXISTS post_view_events_viewer_id_idx ON public.post_view_events (viewer_id);
CREATE INDEX IF NOT EXISTS case_comments_author_id_idx ON public.case_comments (author_id);
CREATE INDEX IF NOT EXISTS client_reviews_attorney_id_idx ON public.client_reviews (attorney_id);
CREATE INDEX IF NOT EXISTS contact_disclosures_client_id_idx ON public.contact_disclosures (client_id);
CREATE INDEX IF NOT EXISTS contact_disclosures_attorney_id_idx ON public.contact_disclosures (attorney_id);
CREATE INDEX IF NOT EXISTS contact_disclosures_case_id_idx ON public.contact_disclosures (case_id);
CREATE INDEX IF NOT EXISTS case_journal_actor_user_id_idx ON public.case_journal (actor_user_id);
CREATE INDEX IF NOT EXISTS attorney_tasks_case_id_idx ON public.attorney_tasks (case_id);
CREATE INDEX IF NOT EXISTS bid_drafts_case_id_idx ON public.bid_drafts (case_id);
CREATE INDEX IF NOT EXISTS stories_file_id_idx ON public.stories (file_id);
CREATE INDEX IF NOT EXISTS review_helpful_votes_user_id_idx ON public.review_helpful_votes (user_id);
CREATE INDEX IF NOT EXISTS client_review_helpful_votes_user_id_idx ON public.client_review_helpful_votes (user_id);
CREATE INDEX IF NOT EXISTS legal_answer_likes_user_id_idx ON public.legal_answer_likes (user_id);
CREATE INDEX IF NOT EXISTS call_participants_invited_by_id_idx ON public.call_participants (invited_by_id);
CREATE INDEX IF NOT EXISTS channel_posts_author_id_idx ON public.channel_posts (author_id);
CREATE INDEX IF NOT EXISTS channel_comments_author_id_idx ON public.channel_comments (author_id);
CREATE INDEX IF NOT EXISTS channel_reactions_user_id_idx ON public.channel_reactions (user_id);
CREATE INDEX IF NOT EXISTS post_shares_user_id_idx ON public.post_shares (user_id);
CREATE INDEX IF NOT EXISTS case_comment_likes_user_id_idx ON public.case_comment_likes (user_id);

-- Replaced by messages_conv_created_id_idx above.
DROP INDEX IF EXISTS public.messages_conversation_id_created_at_idx;
