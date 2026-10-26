-- User-facing load data (2026-10-23, docs/perf/LOAD_SPEED_AUDIT_6_2026-10-23.md).
-- Run AFTER admin-load-gen.sql on the same database. Adds what the hot
-- endpoints read: follows, post likes, reels (video posts), conversations,
-- messages, notifications. Deterministic (no random()).
--   +30 000 reels, 500 000 follows, 1 000 000 post likes,
--   50 000 conversations (100 000 participants), 1 000 000 messages,
--   1 000 000 notifications (10 per person), 600 000 view events.
\timing on
SET synchronous_commit = off;

-- reels: every 10th post gets a ready video asset
INSERT INTO video_assets (id, owner_user_id, provider, library_id, external_id, status, duration_sec, width, height, storage_bytes, upload_expires_at, created_at, ready_at)
SELECT md5('va'||g)::uuid, p.author_id, 'bunny', 'lib1', 'ext'||g, 'ready', 15 + g % 45, 1080, 1920, 3000000, now(), now(), now()
FROM generate_series(1,30000) g JOIN posts p ON p.id = md5('p'||(g*10))::uuid;
UPDATE posts p SET video_asset_id = v.id FROM video_assets v WHERE v.owner_user_id = p.author_id AND false;
WITH x AS (SELECT g, md5('p'||(g*10))::uuid pid, md5('va'||g)::uuid vid FROM generate_series(1,30000) g)
UPDATE posts p SET video_asset_id = x.vid FROM x WHERE p.id = x.pid;

-- follows: each client follows ~5 attorneys
CREATE TEMP TABLE att2 AS SELECT user_id, row_number() over (order by user_id) AS n FROM attorney_profiles;
CREATE TEMP TABLE cli2 AS SELECT id, row_number() over (order by id) AS n FROM users WHERE role='client';
CREATE INDEX ON att2(n); CREATE INDEX ON cli2(n); ANALYZE att2; ANALYZE cli2;
INSERT INTO follows (follower_id, followee_id, created_at)
SELECT c.id, a.user_id, now() - (g||' minutes')::interval
FROM generate_series(1,500000) g
JOIN cli2 c ON c.n = 1 + (g % 90000)
JOIN att2 a ON a.n = 1 + ((g * 7) % 10000)
ON CONFLICT DO NOTHING;

-- post likes
INSERT INTO post_likes (post_id, user_id, created_at)
SELECT md5('p'||(1 + (g * 13) % 300000))::uuid, c.id, now() - (g||' seconds')::interval
FROM generate_series(1,1000000) g JOIN cli2 c ON c.n = 1 + (g % 90000)
ON CONFLICT DO NOTHING;

-- conversations from the first 50 000 bids (case + attorney unique)
INSERT INTO conversations (id, case_id, attorney_id, client_id, bid_id, status, last_message_at, created_at, updated_at)
SELECT md5('cv'||b.n)::uuid, b.case_id, b.attorney_id, c.client_id, b.id, 'active', now() - (b.n||' minutes')::interval, now() - (b.n||' hours')::interval, now()
FROM (SELECT id, case_id, attorney_id, row_number() over (order by id) n FROM bids) b
JOIN cases c ON c.id = b.case_id WHERE b.n <= 50000
ON CONFLICT DO NOTHING;
INSERT INTO conversation_participants (conversation_id, user_id, created_at, updated_at)
SELECT id, attorney_id, now(), now() FROM conversations UNION ALL SELECT id, client_id, now(), now() FROM conversations
ON CONFLICT DO NOTHING;

-- messages: 20 per conversation
INSERT INTO messages (id, conversation_id, sender_id, type, body_original, body_display, client_message_id, created_at, updated_at)
SELECT md5('m'||cv.rn||'-'||k)::uuid, cv.id, CASE WHEN k % 2 = 0 THEN cv.attorney_id ELSE cv.client_id END, 'text',
  'Message '||k||' of the chat. Please send the lease and the photos when you can.', 'Message '||k||' of the chat. Please send the lease and the photos when you can.',
  'cm'||k, now() - ((20 - k) * 30 + cv.rn % 1000 || ' minutes')::interval, now()
FROM (SELECT id, attorney_id, client_id, row_number() over (order by id) rn FROM conversations) cv, generate_series(1,20) k;
UPDATE conversations c SET last_message_id = md5('m'||x.rn||'-20')::uuid
FROM (SELECT id, row_number() over (order by id) rn FROM conversations) x WHERE x.id = c.id;

-- notifications: 10 per person
INSERT INTO notifications (id, user_id, type, category, payload, read_at, created_at, updated_at)
SELECT md5('n'||g)::uuid, md5('u'||(g % 100000 + 1))::uuid,
  (ARRAY['new_message','post_like','new_follower','post_comment','bid_received'])[1 + g % 5]::notification_type,
  (ARRAY['messages','social','social','social','bids'])[1 + g % 5]::notification_category,
  jsonb_build_object('actor_name','Someone '||g,'post_id',md5('p'||(g%300000+1)),'text','Short preview '||g),
  CASE WHEN g % 3 = 0 THEN now() END, now() - (g||' seconds')::interval, now() - (g||' seconds')::interval
FROM generate_series(1,1000000) g;

INSERT INTO post_view_events (post_id, viewer_id, kind, created_at)
SELECT md5('p'||(1 + (g*10) % 300000))::uuid, md5('u'||(g % 100000 + 1))::uuid, 'view', now() - (g||' seconds')::interval
FROM generate_series(1,600000) g;

ANALYZE;
