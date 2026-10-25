-- Seed for the hash-partition benchmark (docs/architecture/TABLE_PARTITIONING_READY.md):
-- 4 000 users, 20 000 chats, 2 000 000 messages, 2 000 000 notifications.
-- Run on a throw-away database only (scripts/perf/hash-partition-bench.sh).
-- Foreign keys are skipped while seeding (the generated ids are consistent);
-- the migration re-validates them when it rebuilds the tables.
SET session_replication_role = replica;
SET synchronous_commit = off;
SET maintenance_work_mem = '512MB';

INSERT INTO users (id, updated_at)
SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, now()
  FROM generate_series(1, 4000) g;

-- chat g: attorney = user ((g-1) % 2000)+1, client = user 2001..4000 chosen so
-- every (attorney, client) pair is different (10 chats per attorney)
INSERT INTO conversations (id, case_id, attorney_id, client_id, status, updated_at, created_at)
SELECT ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, NULL,
       ('00000000-0000-4000-8000-' || lpad((((g - 1) % 2000) + 1)::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((2000 + ((((g - 1) / 2000) * 191 + g - 1) % 2000) + 1)::text, 12, '0'))::uuid,
       'pre_acceptance', now(), now() - interval '400 days'
  FROM generate_series(1, 20000) g;

INSERT INTO conversation_participants (conversation_id, user_id, updated_at)
SELECT c.id, c.attorney_id, now() FROM conversations c
UNION ALL SELECT c.id, c.client_id, now() FROM conversations c;

-- about 100 messages per chat (50..150), spread over a year
CREATE UNLOGGED TABLE _seed_msg AS
SELECT row_number() OVER () AS n, c.cn, k
  FROM (SELECT g AS cn, 50 + (g * 7919 % 101) AS cnt FROM generate_series(1, 20000) g) c,
       LATERAL generate_series(1, c.cnt) k;
DELETE FROM _seed_msg WHERE n > 2000000;

INSERT INTO messages (id, conversation_id, sender_id, type, body_original, body_display,
                      client_message_id, created_at, updated_at)
SELECT gen_random_uuid(),
       ('00000000-0000-4000-9000-' || lpad(s.cn::text, 12, '0'))::uuid,
       CASE WHEN s.k % 2 = 0 THEN c.attorney_id ELSE c.client_id END,
       'text', repeat('x', 40) || s.n, repeat('x', 40) || s.n,
       'cm-' || s.n,
       now() - interval '365 days' * (1 - s.k::numeric / 150) - (s.n % 997) * interval '1 second',
       now()
  FROM _seed_msg s
  JOIN conversations c ON c.id = ('00000000-0000-4000-9000-' || lpad(s.cn::text, 12, '0'))::uuid;
DROP TABLE _seed_msg;

-- every 25th message replies to the first message of its chat
UPDATE messages m SET reply_to_id = p.id
  FROM (SELECT DISTINCT ON (conversation_id) conversation_id, id FROM messages ORDER BY conversation_id, created_at) p
 WHERE p.conversation_id = m.conversation_id AND p.id <> m.id
   AND abs(hashtext(m.id::text)) % 25 = 0;

-- 2 % deleted; chat-list pointers; read pointer 3 days before the end
UPDATE messages SET deleted_at = now() WHERE abs(hashtext(id::text)) % 50 = 1;
UPDATE conversations c SET last_message_at = l.at, last_message_id = l.id
  FROM (SELECT DISTINCT ON (conversation_id) conversation_id, id, created_at AS at
          FROM messages WHERE deleted_at IS NULL ORDER BY conversation_id, created_at DESC) l
 WHERE l.conversation_id = c.id;
UPDATE conversation_participants cp SET last_read_message_id = x.id
  FROM (SELECT DISTINCT ON (conversation_id) conversation_id, id FROM messages
         WHERE created_at < now() - interval '3 days' ORDER BY conversation_id, created_at DESC) x
 WHERE x.conversation_id = cp.conversation_id;

-- reactions, pins (parents of the "message by id" lookups)
INSERT INTO message_reactions (message_id, user_id, emoji)
SELECT m.id, m.sender_id, 'x' FROM messages m
 WHERE abs(hashtext(m.id::text)) % 100 = 2 AND m.sender_id IS NOT NULL;
INSERT INTO message_pins (message_id, conversation_id, pinned_by)
SELECT DISTINCT ON (m.conversation_id) m.id, m.conversation_id, m.sender_id
  FROM messages m WHERE m.sender_id IS NOT NULL AND abs(hashtext(m.id::text)) % 10 = 3;

-- notifications: 500 per person, 8 % unread, 3 % with a dedupe key
INSERT INTO notifications (id, user_id, type, category, payload, read_at, created_at, updated_at, dedupe_key)
SELECT gen_random_uuid(),
       ('00000000-0000-4000-8000-' || lpad(((g % 4000) + 1)::text, 12, '0'))::uuid,
       'new_message', 'messages', '{"n":1}'::jsonb,
       CASE WHEN g % 12 = 0 THEN NULL ELSE now() - interval '1 day' END,
       now() - (g % 365000) * interval '86 seconds',
       now() - (g % 365000) * interval '86 seconds',
       CASE WHEN g % 33 = 0 THEN 'k-' || g END
  FROM generate_series(1, 2000000) g;

RESET session_replication_role;

-- fixed picks so "before" and "after" use the same ids
CREATE TABLE IF NOT EXISTS bench_pick AS
SELECT n,
       (SELECT id FROM conversations ORDER BY id OFFSET (n * 37) % 20000 LIMIT 1) AS conv,
       ('00000000-0000-4000-8000-' || lpad((n % 2000 + 1)::text, 12, '0'))::uuid AS usr
  FROM generate_series(1, 400) n;
ANALYZE;
