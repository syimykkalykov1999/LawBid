#!/usr/bin/env bash
# `sessions` rows for the minted access tokens. mint.mjs / discover.mjs sign
# JWTs without a session row, and with Redis away the API checks revocation in
# the `sessions` table (PR #615), so a token without a row is refused (401) -
# real tokens always have one. jwt.mjs lists the (user id, sid) pairs in
# <out>.sessions.txt; this inserts one row per pair. Idempotent.
#   PSQL='docker exec -i lawbid-lt-postgres-1 psql -U root -d lawbid_lt' seed-sessions.sh tokens.json.sessions.txt [fixtures.json.sessions.txt ...]
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: seed-sessions.sh <sessions.txt>..." >&2; exit 2; }
psql="${PSQL:?PSQL is required}"
cat "$@" | $psql -v ON_ERROR_STOP=1 -qXAt -c "
CREATE TEMP TABLE fx(user_id uuid, sid uuid);
COPY fx FROM STDIN;
WITH ins AS (
  INSERT INTO sessions (user_id, session_chain_id, refresh_hash, expires_at, created_at, updated_at, device_name)
  SELECT user_id, sid, 'lt-fixture-'||sid, now() + interval '30 days', now(), now(), 'k6 fixture' FROM fx
  ON CONFLICT (refresh_hash) DO NOTHING RETURNING 1)
SELECT 'fixture sessions added: '||count(*) FROM ins;"
