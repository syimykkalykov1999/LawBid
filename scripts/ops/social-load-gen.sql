-- User-facing load data, part 3 (2026-11-08, perf guard of the app/web API:
-- apps/api/test/perf-user.e2e-spec.ts). Run AFTER admin-load-gen.sql and
-- user-load-gen.sql, loadtest/sql/loadtest-extra.sql and loadtest/local-docker/licenses.sql
-- (loadtest-extra rewrites chat ids in place; calls have no ON UPDATE CASCADE).
-- Fills the tables the two generators leave empty but every app screen reads,
-- so the perf guard sees real plans (an empty table has no statistics to
-- inflate): comment replies and likes, case comments, tags, groups and their
-- messages, channels and their posts, stories, call history, the contact book,
-- files, saved items, blocks. Deterministic (no random()) and idempotent, like the others;
-- loadtest/local-docker/scale_sql.py scales it with them.
--   +100 000 comment replies, 300 000 comment likes, 50 000 case comments,
--   2 000 tags (300 000 post tags), 10 000 groups (200 000 members,
--   500 000 group messages), 2 000 channels (200 000 subscriptions,
--   100 000 channel posts), 20 000 live stories (100 000 views),
--   200 000 calls, 500 000 contact-book hashes (100 000 matches),
--   200 000 files, 100 000 saved posts, 20 000 blocks.
\timing on
SET synchronous_commit = off;
-- Version-4 shaped ids (the strict id validators of some routes reject the
-- plain md5 uuids of the older generators, see loadtest-extra.sql).
CREATE FUNCTION pg_temp.v4(t text) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT (substr(m, 1, 12) || '4' || substr(m, 14, 3) || '8' || substr(m, 18))::uuid FROM md5(t) m $$;

CREATE TEMP TABLE att3 AS SELECT user_id, row_number() over (order by user_id) AS n FROM attorney_profiles;
CREATE TEMP TABLE cli3 AS SELECT id, row_number() over (order by id) AS n FROM users WHERE role='client';
CREATE INDEX ON att3(n); CREATE INDEX ON cli3(n); ANALYZE att3; ANALYZE cli3;

-- replies to the first 50 000 comments (2 each) and comment likes
INSERT INTO comments (id, post_id, author_id, parent_comment_id, body, updated_at, created_at)
SELECT pg_temp.v4('cr'||g), c.post_id, x.id, c.id, 'Reply '||g, now(), c.created_at + ((g % 60) || ' minutes')::interval
FROM generate_series(1,100000) g
JOIN comments c ON c.id = md5('c'||(1 + g % 50000))::uuid
JOIN cli3 x ON x.n = 1 + ((g * 3) % 90000)
ON CONFLICT DO NOTHING;
INSERT INTO comment_likes (comment_id, user_id, created_at)
SELECT md5('c'||(1 + (g * 7) % 100000))::uuid, x.id, now() - (g||' seconds')::interval
FROM generate_series(1,300000) g JOIN cli3 x ON x.n = 1 + (g % 90000)
ON CONFLICT DO NOTHING;

INSERT INTO case_comments (id, case_id, author_id, body, updated_at, created_at)
SELECT pg_temp.v4('cc'||g), md5('case'||(1 + g % 50000))::uuid, a.user_id, 'Public question about case '||g, now(), now() - (g||' minutes')::interval
FROM generate_series(1,50000) g JOIN att3 a ON a.n = 1 + (g % 10000)
ON CONFLICT DO NOTHING;

-- tags: one per post, 2 000 tags (a few very popular)
INSERT INTO tags (id, tag_lower, created_at)
SELECT pg_temp.v4('tag'||g), 'perftag'||g, now() FROM generate_series(1,2000) g
ON CONFLICT DO NOTHING;
INSERT INTO post_tags (post_id, tag_id)
SELECT p.id, pg_temp.v4('tag'||(1 + (g % 97) * (g % 23) % 2000))
FROM generate_series(1,300000) g JOIN posts p ON p.id = md5('p'||g)::uuid
ON CONFLICT DO NOTHING;

-- groups: 10 000 groups of 20 people, 50 messages each
INSERT INTO chat_groups (id, title, created_by, group_type, username, username_lower, invite_code, member_count, last_message_at, created_at, updated_at)
SELECT pg_temp.v4('g'||g), 'Group '||g, x.id, (ARRAY['private','closed','public'])[1 + g % 3]::group_type,
  CASE WHEN g % 3 = 2 THEN 'perfgroup'||g END, CASE WHEN g % 3 = 2 THEN 'perfgroup'||g END, 'inv'||g, 20, now() - (g||' minutes')::interval, now() - (g||' hours')::interval, now()
FROM generate_series(1,10000) g JOIN cli3 x ON x.n = 1 + (g % 90000)
ON CONFLICT DO NOTHING;
INSERT INTO chat_group_members (group_id, user_id, role, joined_at, updated_at)
SELECT pg_temp.v4('g'||(1 + g % 10000)), x.id, CASE WHEN g <= 10000 THEN 'owner'::chat_group_role ELSE 'member'::chat_group_role END,
  now() - (g||' seconds')::interval, now()
FROM generate_series(1,200000) g JOIN cli3 x ON x.n = 1 + ((g + (g / 10000) * 37) % 90000)
ON CONFLICT DO NOTHING;
INSERT INTO chat_group_messages (id, group_id, sender_id, type, body, client_message_id, created_at)
SELECT pg_temp.v4('gm'||g), pg_temp.v4('g'||(1 + g % 10000)), x.id, 'text', 'Group message '||g, 'gcm'||g,
  now() - (g||' seconds')::interval
FROM generate_series(1,500000) g JOIN cli3 x ON x.n = 1 + (g % 90000)
ON CONFLICT DO NOTHING;

-- channels: 2 000 channels of attorneys, 100 subscribers, 50 posts each
INSERT INTO channels (id, owner_id, title, username, subscriber_count, post_count, last_post_at, created_at, updated_at)
SELECT pg_temp.v4('ch'||g), a.user_id, 'Channel '||g, 'perfchan'||g, 100, 50, now() - (g||' minutes')::interval, now() - (g||' hours')::interval, now()
FROM generate_series(1,2000) g JOIN att3 a ON a.n = 1 + (g % 10000)
ON CONFLICT DO NOTHING;
INSERT INTO channel_subscriptions (channel_id, user_id, created_at)
SELECT pg_temp.v4('ch'||(1 + g % 2000)), x.id, now() - (g||' seconds')::interval
FROM generate_series(1,200000) g JOIN cli3 x ON x.n = 1 + ((g * 11) % 90000)
ON CONFLICT DO NOTHING;
INSERT INTO channel_posts (id, channel_id, author_id, body, created_at)
SELECT pg_temp.v4('cp'||g), c.id, c.owner_id, 'Channel post '||g, now() - (g||' minutes')::interval
FROM generate_series(1,100000) g JOIN channels c ON c.id = pg_temp.v4('ch'||(1 + g % 2000))
ON CONFLICT DO NOTHING;

-- stories: 20 000 live (24 h) text stories, 5 views each
INSERT INTO stories (id, author_id, kind, text, created_at, expires_at)
SELECT pg_temp.v4('st'||g), a.user_id, 'text', 'Story '||g, now() - ((g % 1200)||' minutes')::interval,
  now() + interval '24 hours' - ((g % 1200)||' minutes')::interval
FROM generate_series(1,20000) g JOIN att3 a ON a.n = 1 + (g % 10000)
ON CONFLICT DO NOTHING;
INSERT INTO story_views (story_id, viewer_id, viewed_at)
SELECT pg_temp.v4('st'||(1 + g % 20000)), x.id, now() - (g||' seconds')::interval
FROM generate_series(1,100000) g JOIN cli3 x ON x.n = 1 + ((g * 13) % 90000)
ON CONFLICT DO NOTHING;

-- call history: 4 calls in each of the 50 000 chats
INSERT INTO calls (id, conversation_id, caller_id, callee_id, status, answered_at, ended_at, duration_sec, created_at, updated_at)
SELECT pg_temp.v4('call'||cv.rn||'-'||k), cv.id,
  CASE WHEN k % 2 = 0 THEN cv.attorney_id ELSE cv.client_id END,
  CASE WHEN k % 2 = 0 THEN cv.client_id ELSE cv.attorney_id END,
  (ARRAY['ended','missed','declined','ended'])[k]::call_status,
  now() - ((k * 600 + cv.rn % 1000)||' minutes')::interval, now() - ((k * 600 + cv.rn % 1000 - 5)||' minutes')::interval, 300,
  now() - ((k * 600 + cv.rn % 1000)||' minutes')::interval, now()
FROM (SELECT id, attorney_id, client_id, row_number() over (order by id) rn FROM conversations) cv, generate_series(1,4) k
ON CONFLICT DO NOTHING;

-- contact book: 5 hashed numbers for each of 100 000 people, 100 000 matches
INSERT INTO contact_book_hashes (owner_id, phone_sha256, created_at)
SELECT md5('u'||(1 + g % 100000))::uuid, encode(sha256(('+1555'||g)::bytea), 'hex'), now()
FROM generate_series(1,500000) g
ON CONFLICT DO NOTHING;
INSERT INTO contact_matches (owner_id, matched_id, created_at)
SELECT md5('u'||(1 + g % 100000))::uuid, md5('u'||(1 + (g * 17) % 100000))::uuid, now()
FROM generate_series(1,100000) g
WHERE (1 + g % 100000) <> (1 + (g * 17) % 100000)
ON CONFLICT DO NOTHING;

-- files: 2 per person (chat attachments and avatars), scanned clean
INSERT INTO files (id, owner_user_id, purpose, s3_bucket, s3_key, mime, size_bytes, sha256, scan_status, created_at, updated_at)
SELECT pg_temp.v4('f'||g), md5('u'||(1 + g % 100000))::uuid,
  (ARRAY['chat_attachment','avatar','post_image','case_attachment'])[1 + g % 4]::file_purpose,
  'lawbid-perf-media', 'perf/'||g, 'image/jpeg', 100000 + g % 900000, md5('f'||g), 'clean', now() - (g||' seconds')::interval, now()
FROM generate_series(1,200000) g
ON CONFLICT DO NOTHING;

INSERT INTO saved_items (user_id, item_type, item_id, created_at)
SELECT x.id, 'post', p.id, now() - (g||' seconds')::interval
FROM generate_series(1,100000) g JOIN cli3 x ON x.n = 1 + (g % 90000)
JOIN posts p ON p.id = md5('p'||(1 + (g * 19) % 300000))::uuid
ON CONFLICT DO NOTHING;
INSERT INTO user_blocks (blocker_id, blocked_id, created_at)
SELECT x.id, md5('u'||(1 + (g * 29) % 100000))::uuid, now()
FROM generate_series(1,20000) g JOIN cli3 x ON x.n = 1 + (g % 90000)
WHERE x.id <> md5('u'||(1 + (g * 29) % 100000))::uuid
ON CONFLICT DO NOTHING;

ANALYZE;
SELECT 'chat_group_messages' t, count(*) FROM chat_group_messages UNION ALL SELECT 'channel_posts', count(*) FROM channel_posts
UNION ALL SELECT 'stories', count(*) FROM stories UNION ALL SELECT 'calls', count(*) FROM calls
UNION ALL SELECT 'contact_book_hashes', count(*) FROM contact_book_hashes UNION ALL SELECT 'files', count(*) FROM files;
