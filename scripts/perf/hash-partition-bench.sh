#!/bin/sh
# Hot-query benchmark for migration 20261029300000 (hash partitioning of
# messages / chat_group_messages / notifications).
#   sh scripts/perf/hash-partition-bench.sh            # whole run (needs docker)
# Starts its own throw-away PostgreSQL 16, applies every migration BEFORE the
# partition one, seeds 2M messages / 20k chats / 2M notifications, measures
# (EXPLAIN + pgbench), applies the partition migration, measures again,
# removes the container. Results: $OUT (default /tmp/hash-bench).
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../apps/api/prisma/migrations"
NAME=${BENCH_CONTAINER:-lawbid-hashbench}
PORT=${BENCH_PORT:-55444}
OUT=${OUT:-/tmp/hash-bench}
SECS=${BENCH_SECONDS:-10}
PARTMIG=20261031700000_partition_messages_notifications
mkdir -p "$OUT"
docker rm -fv "$NAME" >/dev/null 2>&1 || true
[ -n "${BENCH_SEED_ONLY:-}" ] || trap 'docker rm -fv "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=b -p "$PORT:5432" postgres:16 \
  -c shared_buffers=1GB -c max_wal_size=8GB -c fsync=off -c synchronous_commit=off -c work_mem=32MB >/dev/null
until docker exec "$NAME" pg_isready -U postgres -d b >/dev/null 2>&1; do sleep 1; done
sleep 3
psql_() { docker exec -i "$NAME" psql -U postgres -d b -v ON_ERROR_STOP=1 -q "$@"; }

psql_ -c "CREATE TABLE _prisma_migrations (id text)"
for d in $(ls "$MIG" | grep -v migration_lock | grep -v "$PARTMIG"); do
  cat "$MIG/$d/migration.sql"; echo
done | psql_ >/dev/null
psql_ -v scale="${BENCH_SCALE:-1}" < "$HERE/hash-partition-seed.sql"
if [ -n "${BENCH_SEED_ONLY:-}" ]; then
  # Keep the container with a template copy of the seeded (flat) database for experiments.
  docker exec -i "$NAME" psql -U postgres -d postgres -c "CREATE DATABASE b_flat TEMPLATE b"
  echo "seeded; container $NAME kept (remove it yourself)"; exit 0
fi

measure() { # $1 = label
  L=$1
  {
    cat "$HERE/hash-partition-queries.sql"
    # name | execute arguments | title
    while IFS='|' read -r q args title; do
      [ -z "$q" ] && continue
      echo "\\echo"; echo "\\echo ===== $q $title"
      for _ in 1 2 3 4 5 6; do echo "\\o /dev/null"; echo "EXECUTE $q($args);"; echo "\\o"; done
      echo "EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) EXECUTE $q($args);"
    done <<LIST
q1|:'cid'|chat history page
q2|:'mids'::uuid[], :'cids'::uuid[]|last message per chat (chat list)
q3|:'uid', :'cids'::uuid[]|unread count per chat
q4|:'mid'|message by id ALONE (save / forward route)
q5|:'mid', :'cid'|message by (chat, id) (reactions, pins, replies, edit)
q6|:'uid'|notification list
q7|:'uid'|unread badge
q8|:'uid', :'dk'|dedupe upsert (key exists)
q9|:'cid'|pinned messages of a chat
q10|:'mid', :'cid'|replies of a message
LIST
  } \
    | psql_ > "$OUT/$L-explain.txt" 2>&1 || true
  # steady throughput: one pgbench script per query, 1 client, prepared
  for q in 1 2 3 4 5 6 7 8 9 10; do
    cat > "$OUT/q$q.pgb" <<PGB
\\set n random(1, 400)
SELECT conv::text AS cid, usr::text AS uid FROM bench_pick WHERE n = :n \\gset
SELECT '{' || string_agg(id::text, ',') || '}' AS cids, '{' || string_agg(last_message_id::text, ',') || '}' AS mids FROM conversations WHERE attorney_id = :uid::uuid \\gset
SELECT last_message_id::text AS mid FROM conversations WHERE id = :cid::uuid \\gset
SELECT coalesce(max(dedupe_key), 'none') AS dk FROM (SELECT dedupe_key FROM notifications WHERE user_id = :uid::uuid AND dedupe_key IS NOT NULL LIMIT 1) z \\gset
PGB
  done
  W() { printf '%s\n' "$2" >> "$OUT/q$1.pgb"; }
  W 1 "SELECT * FROM messages WHERE conversation_id = :cid::uuid AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50;"
  W 2 "SELECT m.* FROM unnest(:mids::uuid[], :cids::uuid[]) AS t(mid, cid) JOIN messages m ON m.id = t.mid AND m.conversation_id = t.cid WHERE m.deleted_at IS NULL;"
  W 3 "SELECT cp.conversation_id::TEXT AS id, (SELECT count(*) FROM (SELECT 1 FROM messages m WHERE m.conversation_id = cp.conversation_id AND m.deleted_at IS NULL AND (m.sender_id IS NULL OR m.sender_id <> :uid::uuid) AND (lr.id IS NULL OR (m.created_at, m.id) > (lr.created_at, lr.id)) ORDER BY m.created_at DESC LIMIT 100) x) AS n FROM conversation_participants cp LEFT JOIN messages lr ON lr.id = cp.last_read_message_id AND lr.conversation_id = cp.conversation_id WHERE cp.user_id = :uid::uuid AND cp.conversation_id = ANY(:cids::uuid[]);"
  W 4 "SELECT * FROM messages WHERE id = :mid::uuid AND deleted_at IS NULL LIMIT 1;"
  W 5 "SELECT * FROM messages WHERE id = :mid::uuid AND conversation_id = :cid::uuid;"
  W 6 "SELECT * FROM notifications WHERE user_id = :uid::uuid ORDER BY created_at DESC, id DESC LIMIT 30;"
  W 7 "SELECT count(*) AS n FROM (SELECT 1 FROM notifications WHERE user_id = :uid::uuid AND read_at IS NULL AND NOT (type::TEXT = ANY('{}'::TEXT[])) LIMIT 100) x;"
  W 8 "INSERT INTO notifications (user_id, type, category, payload, dedupe_key, updated_at) VALUES (:uid::uuid, 'new_message', 'messages', '{}', :dk, now()) ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET aggregate_count = notifications.aggregate_count + 1, updated_at = now();"
  W 9 "SELECT m.* FROM message_pins p JOIN messages m ON m.id = p.message_id AND m.conversation_id = p.conversation_id WHERE p.conversation_id = :cid::uuid ORDER BY p.pinned_at DESC;"
  W 10 "SELECT id FROM messages WHERE reply_to_id = :mid::uuid AND conversation_id = :cid::uuid;"
  : > "$OUT/$L-latency.txt"
  for q in 1 2 3 4 5 6 7 8 9 10; do
    docker cp "$OUT/q$q.pgb" "$NAME:/tmp/q$q.pgb" >/dev/null
    echo "== q$q" >> "$OUT/$L-latency.txt"
    docker exec "$NAME" pgbench -U postgres -d b -n -M prepared -c 1 -T "$SECS" -r -f "/tmp/q$q.pgb" 2>&1 \
      | grep -E "latency average|^ +[0-9.]+ +" | tail -7 >> "$OUT/$L-latency.txt"
  done
}

measure before
START=$(date +%s)
psql_ < "$MIG/$PARTMIG/migration.sql" > "$OUT/migration-output.txt" 2>&1
echo "migration seconds: $(( $(date +%s) - START ))" | tee "$OUT/migration-time.txt"
psql_ -c "ANALYZE"
measure after
echo "results in $OUT"
