-- The hot queries of chat and notifications as the API sends them (shapes from
-- chat.service.ts, badges.service.ts, notifications.service.ts). Each one is a
-- prepared statement so PostgreSQL behaves like it does under Prisma/pg
-- (5 custom plans, then possibly the generic plan).
-- Used by hash-partition-bench.sh (it appends EXECUTE / EXPLAIN lines); the
-- picks come from bench_pick, the same ids before and after the migration.
\set ON_ERROR_STOP on
SELECT conv::text AS cid, usr::text AS uid FROM bench_pick WHERE n = 17 \gset
SELECT '{' || string_agg(id::text, ',') || '}' AS cids, '{' || string_agg(last_message_id::text, ',') || '}' AS mids
  FROM conversations WHERE attorney_id = :'uid' \gset
SELECT last_message_id::text AS mid FROM conversations WHERE id = :'cid' \gset
SELECT dedupe_key AS dk FROM notifications WHERE user_id = :'uid' AND dedupe_key IS NOT NULL LIMIT 1 \gset

PREPARE q1(uuid) AS SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50;
PREPARE q2(uuid[], uuid[]) AS SELECT m.* FROM unnest($1, $2) AS t(mid, cid) JOIN messages m ON m.id = t.mid AND m.conversation_id = t.cid WHERE m.deleted_at IS NULL;
PREPARE q3(uuid, uuid[]) AS
  SELECT cp.conversation_id::TEXT AS id,
         (SELECT count(*) FROM (SELECT 1 FROM messages m WHERE m.conversation_id = cp.conversation_id AND m.deleted_at IS NULL
             AND (m.sender_id IS NULL OR m.sender_id <> $1)
             AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id))
           ORDER BY m.created_at DESC LIMIT 100) x) AS n
  FROM conversation_participants cp
  LEFT JOIN messages lr ON lr.id = cp.last_read_message_id AND lr.conversation_id = cp.conversation_id
  WHERE cp.user_id = $1 AND cp.conversation_id = ANY($2);
PREPARE q4(uuid) AS SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL LIMIT 1;
PREPARE q5(uuid, uuid) AS SELECT * FROM messages WHERE id = $1 AND conversation_id = $2;
PREPARE q6(uuid) AS SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 30;
PREPARE q7(uuid) AS SELECT count(*) AS n FROM (SELECT 1 FROM notifications WHERE user_id = $1 AND read_at IS NULL AND NOT (type::TEXT = ANY('{}'::TEXT[])) LIMIT 100) x;
PREPARE q8(uuid, text) AS INSERT INTO notifications (user_id, type, category, payload, dedupe_key, updated_at)
  VALUES ($1, 'new_message', 'messages', '{}', $2, now())
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET aggregate_count = notifications.aggregate_count + 1, updated_at = now();
PREPARE q9(uuid) AS SELECT m.* FROM message_pins p JOIN messages m ON m.id = p.message_id AND m.conversation_id = p.conversation_id WHERE p.conversation_id = $1 ORDER BY p.pinned_at DESC;
PREPARE q10(uuid, uuid) AS SELECT id FROM messages WHERE reply_to_id = $1 AND conversation_id = $2;

