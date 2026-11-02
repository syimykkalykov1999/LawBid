#!/usr/bin/env bash
# Test accounts + ids for the k6 runs against the local stack (seeded DB).
#   prepare.sh <outdir> [clients=6000] [attorneys=1500] [admins=10]
set -euo pipefail
out="$1"; nc="${2:-6000}"; na="${3:-1500}"; nadm="${4:-10}"
here="$(cd "$(dirname "$0")" && pwd)"; repo="${REPO:-$(cd "$here/../.." && pwd)}"; stack="$here"
envf="${API_ENV:-$stack/api.env}"
mkdir -p "$out"
keys="$(grep '^JWT_KEYS=' "$envf" | cut -d= -f2-)"
export JWT_SECRET="${keys#*:}" JWT_KID="${keys%%:*}"
node "$repo/loadtest/scripts/mint.mjs" "$out/tokens.json" "$nc" "$na" "$nadm"
REDIS_CLI="docker exec -i lawbid-lt-redis-1 redis-cli -n 0" "$repo/loadtest/scripts/seed-admin-sessions.sh" "$out/tokens.json.admin-sessions.txt"
# full mix (MIX=full): cases with an accepted offer (deal record; the API's
# strict validators accept only version-4 ids) and active practice areas
PGQ="docker exec ${PG_CONTAINER:-lawbid-lt-postgres-1} psql -U root -d ${DB:-lawbid_lt} -tAq"
$PGQ -c "select c.id || ' ' || c.client_id from cases c where c.accepted_bid_id is not null and c.status in ('in_progress','closed') and c.id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]' limit 300" > "$out/deals.txt" || true
$PGQ -c "select id from posts tablesample system (1) where deleted_at is null and id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]' limit 2000" > "$out/posts.txt" || true
$PGQ -c "select p.user_id || ' ' || p.username from attorney_profiles p join users u on u.id = p.user_id where u.deleted_at is null and p.user_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]' limit 1000" > "$out/attorneys.txt" || true
$PGQ -c "select id from practice_areas where is_active limit 100" > "$out/practices.txt" || true
ATTORNEYS_FILE="$out/attorneys.txt" POSTS_FILE="$out/posts.txt" PRACTICES_FILE="$out/practices.txt" DEALS_FILE="$out/deals.txt" API_URL="http://127.0.0.1:3055/api/v1" node "$repo/loadtest/scripts/discover.mjs" "$out/fixtures.json" 1500 0
python3 -c "import json,sys;t=json.load(open('$out/tokens.json'));f=json.load(open('$out/fixtures.json'));print({k:len(v) for k,v in t.items() if isinstance(v,list)},{k:len(v) for k,v in f.items() if isinstance(v,list)})"
