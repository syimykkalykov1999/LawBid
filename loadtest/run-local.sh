#!/usr/bin/env bash
# Step 1 of the staged load test: the whole thing on this Mac, free, at low
# load. It catches wrong URLs, wrong fields, a broken seed or a script that
# does not run - before any AWS money is spent. Profile `local`
# (loadtest/profiles.json): 40 req/s, a few dozen sockets, 1 call/s, ~3 min.
#
#   loadtest/run-local.sh [--fresh] [--keep]
#     --fresh  drop and re-seed the load-test database (about 4 minutes)
#     --keep   leave the API and the Docker containers running afterwards
#
# Needs: Docker (the repo's compose containers lawbid-postgres-1 /
# lawbid-redis-1 / lawbid-minio-1), k6 (brew install k6), node, python3.
# Uses its OWN database `lawbid_loadtest` and Redis db 7: your dev data is
# not touched. Results: loadtest/results/local-<time>/ (report.md inside).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
fresh=0; keep=0
for a in "$@"; do case "$a" in --fresh) fresh=1;; --keep) keep=1;; *) echo "unknown option $a" >&2; exit 2;; esac; done

for t in docker k6 node python3 curl; do
  command -v "$t" >/dev/null || { echo "missing tool: $t$([ "$t" = k6 ] && echo ' (brew install k6)')" >&2; exit 2; }
done

PG=lawbid-postgres-1; RD=lawbid-redis-1; MN=lawbid-minio-1
DB=lawbid_loadtest
LT_PORT="${LOADTEST_PORT:-3055}"
started=()
for c in $PG $RD $MN; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" != true ]; then
    docker start "$c" >/dev/null && started+=("$c")
  fi
done
until docker exec $PG pg_isready -U root -d postgres >/dev/null 2>&1; do sleep 1; done
until [ "$(docker exec $RD redis-cli ping 2>/dev/null)" = PONG ]; do sleep 1; done

api_pid=""
cleanup() {
  [ -n "$api_pid" ] && kill "$api_pid" 2>/dev/null || true
  if [ "$keep" = 0 ]; then
    [ ${#started[@]} -gt 0 ] && docker stop "${started[@]}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

psql_db() { docker exec -i $PG psql -U root -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }

# --- database ---------------------------------------------------------------
exists="$(docker exec $PG psql -U root -d postgres -tAc "select 1 from pg_database where datname='$DB'")"
if [ "$fresh" = 1 ] || [ -z "$exists" ]; then
  echo "== creating and seeding $DB (about 4 minutes)"
  docker exec $PG psql -U root -d postgres -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
  (cd "$repo/apps/api" && DATABASE_URL="postgresql://root:lawbid@localhost:5432/$DB?sslmode=disable" npx prisma migrate deploy >/dev/null)
  for f in scripts/ops/admin-load-gen.sql scripts/ops/user-load-gen.sql loadtest/sql/loadtest-extra.sql; do
    echo "   $f"; psql_db <"$repo/$f" >/dev/null
  done
else
  echo "== $DB exists (use --fresh to re-seed)"
fi

# --- the API ----------------------------------------------------------------
envfile="${ENV_FILE:-}"
[ -z "$envfile" ] && for c in "$repo/apps/api/.env" "$repo/../apps/api/.env" "$repo/../../../apps/api/.env" "$HOME/Desktop/LawBid/apps/api/.env"; do [ -f "$c" ] && { envfile="$c"; break; }; done
[ -n "$envfile" ] || { echo "no apps/api/.env found (set ENV_FILE)" >&2; exit 2; }
secret="$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
if [ ! -f "$repo/apps/api/dist/src/main.js" ] || [ -n "$(find "$repo/apps/api/src" -newer "$repo/apps/api/dist/src/main.js" -name '*.ts' -print -quit)" ]; then
  echo "== building the API"; (cd "$repo/apps/api" && npm run build >/dev/null)
fi
echo "== starting the API on :$LT_PORT"
mkdir -p "$here/results"
(
  cd "$repo/apps/api"
  set -a; . "$envfile"; set +a
  export PORT="$LT_PORT" NODE_ENV=development
  export DATABASE_URL="postgresql://root:lawbid@localhost:5432/$DB?sslmode=disable"
  export REDIS_URL="redis://localhost:6379/7"
  export JWT_KEYS="lt1:$secret" JWT_ACTIVE_KID=lt1
  export JOBS_ENABLED=false
  exec node dist/src/main
) >"$here/results/api-local.log" 2>&1 &
api_pid=$!
for i in $(seq 1 90); do
  curl -fs "http://localhost:$LT_PORT/health/live" >/dev/null 2>&1 && break
  kill -0 "$api_pid" 2>/dev/null || { echo "API died:"; tail -30 "$here/results/api-local.log"; exit 1; }
  sleep 1
done
curl -fs "http://localhost:$LT_PORT/health/live" >/dev/null || { echo "API did not start:"; tail -30 "$here/results/api-local.log"; exit 1; }

# --- accounts, ids, run -----------------------------------------------------
out="$here/results/local-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
export JWT_SECRET="$secret" JWT_KID=lt1
node "$here/scripts/mint.mjs" "$out/tokens.json" 300 100 5
REDIS_CLI="docker exec $RD redis-cli -n 7" "$here/scripts/seed-admin-sessions.sh" "$out/tokens.json.admin-sessions.txt"
API_URL="http://localhost:$LT_PORT/api/v1" node "$here/scripts/discover.mjs" "$out/fixtures.json" 150 0

set +e
PROFILE=local ALLOW_LOCAL=1 API_URL="http://localhost:$LT_PORT/api/v1" WS_URL="ws://localhost:$LT_PORT" \
  TOKENS_FILE="$out/tokens.json" FIXTURES_FILE="$out/fixtures.json" OUT="$out" \
  "$here/scripts/run-generator.sh"
rc=$?
set -e
node "$here/scripts/report.mjs" --profile local --dir "$out" >"$out/report.md" 2>/dev/null || true
echo "== result code $rc (0 ok, 3 aborted, 4 targets missed); report: $out/report.md"
echo "   API log: $here/results/api-local.log"
exit $rc
