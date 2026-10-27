#!/usr/bin/env bash
# Local full-stack smoke BEFORE pressing Approve on a deploy (deploy safety
# audit 2026-10-27, docs/dev/DEPLOY_SAFETY_AUDIT_2026-10-27.md, part 3).
# Runs the SAME chain the production deploy runs, on a throwaway database:
#   1. Postgres + Redis from docker-compose.yml (started only if not running;
#      the ones this script started are stopped at the end);
#   2. a fresh database `lawbid_smoke` <- `prisma migrate deploy`
#      + prisma/run-concurrent.mjs + prisma/verify-schema.mjs (the migrate task);
#   3. the config preflight of the deploy (dist/src/cli/check-config.js);
#   4. the built API (dist/src/main.js, JOBS_ENABLED=false like the ECS api
#      task) and, with SMOKE_WORKER=1, the worker (dist/src/worker.js);
#   5. health + one GET per module from openapi.json
#      (scripts/dev/smoke-local-endpoints.mjs): any 5xx or no answer = red.
# Heavy (build + boot): run it through the queue, one at a time:
#   scripts/dev/heavy.sh npm run smoke:local
# SMOKE_SKIP_BUILD=1 reuses apps/api/dist. SMOKE_PORT (default 3999).
# SMOKE_REDIS_URL (default redis://localhost:6379/9, a separate Redis db).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_DIR="$ROOT/apps/api"
PORT="${SMOKE_PORT:-3999}"
DB="lawbid_smoke"
LOG_DIR="$(mktemp -d)"
STARTED=""
PIDS=""

cleanup() {
  for p in $PIDS; do kill "$p" 2>/dev/null || true; done
  docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
    psql -U root -d postgres -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1 || true
  if [ -n "$STARTED" ]; then
    echo "stopping containers this smoke started: $STARTED"
    # shellcheck disable=SC2086
    docker compose -f "$ROOT/docker-compose.yml" stop $STARTED >/dev/null 2>&1 || true
  fi
  echo "logs: $LOG_DIR"
}
trap cleanup EXIT

echo "1/5 Postgres + Redis"
for svc in postgres redis; do
  if [ -z "$(docker compose -f "$ROOT/docker-compose.yml" ps -q --status running "$svc" 2>/dev/null)" ] \
     && ! docker ps --format '{{.Names}}' | grep -q "lawbid-${svc}-1"; then
    docker compose -f "$ROOT/docker-compose.yml" up -d "$svc" >/dev/null
    STARTED="$STARTED $svc"
  fi
done
for _ in $(seq 1 30); do
  docker exec lawbid-postgres-1 pg_isready -U root >/dev/null 2>&1 && break
  sleep 1
done
docker exec lawbid-postgres-1 psql -U root -d postgres -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null
docker exec lawbid-postgres-1 psql -U root -d postgres -qc "CREATE DATABASE $DB" >/dev/null

# The test env (local keys), pointed at the throwaway database.
set -a
# shellcheck disable=SC1091
. "$API_DIR/.env.test"
set +a
export DATABASE_URL="postgresql://root:lawbid@localhost:5432/${DB}?schema=public"
# Own Redis database number: other workers' e2e runs share this Redis; the
# smoke's queues and schedules must not touch theirs.
export REDIS_URL="${SMOKE_REDIS_URL:-redis://localhost:6379/9}"
export PORT="${SMOKE_PORT:-3999}" JOBS_ENABLED=false NODE_ENV=test
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

echo "2/5 migrations exactly as the deploy's migrate task runs them"
(cd "$API_DIR" && npx prisma migrate deploy >"$LOG_DIR/migrate.log" 2>&1 \
  && node prisma/run-concurrent.mjs >>"$LOG_DIR/migrate.log" 2>&1 \
  && node prisma/verify-schema.mjs | tee -a "$LOG_DIR/migrate.log") \
  || { tail -40 "$LOG_DIR/migrate.log"; echo "FAILED: migrations / schema check"; exit 1; }

if [ "${SMOKE_SKIP_BUILD:-}" != "1" ]; then
  echo "   building the api (nest build)"
  (cd "$API_DIR" && npx prisma generate >/dev/null && npx nest build >"$LOG_DIR/build.log" 2>&1) \
    || { tail -40 "$LOG_DIR/build.log"; echo "FAILED: build"; exit 1; }
fi

echo "3/5 config preflight (the deploy's check-config)"
(cd "$API_DIR" && node dist/src/cli/check-config.js) || { echo "FAILED: config preflight"; exit 1; }

echo "4/5 boot the api on :$PORT${SMOKE_WORKER:+ and the worker}"
(cd "$API_DIR" && node dist/src/main.js >"$LOG_DIR/api.log" 2>&1) &
PIDS="$PIDS $!"
if [ "${SMOKE_WORKER:-}" = "1" ]; then
  (cd "$API_DIR" && JOBS_ENABLED=true node dist/src/worker.js >"$LOG_DIR/worker.log" 2>&1) &
  PIDS="$PIDS $!"
fi
ready=""
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$PORT/health/ready" >/dev/null 2>&1 \
     || curl -fsS "http://localhost:$PORT/api/v1/health/ready" >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 2
done
[ -n "$ready" ] || { tail -60 "$LOG_DIR/api.log"; echo "FAILED: api not ready in 180 s"; exit 1; }

echo "5/5 one request per module"
node "$ROOT/scripts/dev/smoke-local-endpoints.mjs" "http://localhost:$PORT" | tee "$LOG_DIR/endpoints.log"
status=${PIPESTATUS[0]}
if grep -Eiq '"level":(50|60)|\bERROR\b' "$LOG_DIR/api.log"; then
  echo "note: the api log has error lines (see $LOG_DIR/api.log):"
  grep -Ei '"level":(50|60)|\bERROR\b' "$LOG_DIR/api.log" | cut -c1-200 | head -10
fi
[ "$status" = "0" ] && echo "SMOKE OK" || { echo "SMOKE FAILED"; exit 1; }
