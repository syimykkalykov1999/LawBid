#!/usr/bin/env bash
# Staff load run (k6/staff.js): seeds N staff (staff.sql), mints their tokens
# and admin sessions, runs k6 with the resource sampler, checks lease contention.
#   staff.sh <name> <N staff> [VUS=N] [HOLD=3m] [RAMP=1m] [DB=lawbid_lt]
set -uo pipefail
name="$1"; n="$2"; shift 2
for kv in "$@"; do export "$kv"; done
here="$(cd "$(dirname "$0")" && pwd)"; repo="${REPO:-$(cd "$here/../.." && pwd)}"
DB="${DB:-lawbid_lt}"; res="$HOME/loadtest/results/$name"; mkdir -p "$res"
docker exec -i ${PG_CONTAINER:-lawbid-lt-postgres-1} psql -U root -d "$DB" -v n="$n" -q < "$here/staff.sql"
docker cp ${PG_CONTAINER:-lawbid-lt-postgres-1}:/tmp/staff.txt "$res/staff.txt"
keys="$(grep '^JWT_KEYS=' "${API_ENV:-$here/api.env}" | cut -d= -f2-)"
JWT_SECRET="${keys#*:}" JWT_KID="${keys%%:*}" node "$repo/loadtest/scripts/mint-staff.mjs" "$res/staff.txt" "$res/staff.json"
REDIS_CLI="docker exec lawbid-lt-redis-1 redis-cli -n 0" "$repo/loadtest/scripts/seed-admin-sessions.sh" "$res/staff.json.admin-sessions.txt"
# the API keeps app settings in memory for a while: restart so the switches apply
if [ "${RESTART:-1}" = 1 ]; then
  docker restart $(docker ps -q --filter name=lawbid-lt-api- --filter name=lawbid-lt-worker) >/dev/null
  until curl -sf http://127.0.0.1:3055/health/live >/dev/null; do sleep 2; done; sleep 5
fi
PG="docker exec ${PG_CONTAINER:-lawbid-lt-postgres-1} psql -U root -d $DB -tAq"
$PG -c "select pg_stat_statements_reset()" >/dev/null
( while true; do
    ts=$(date +%T)
    docker stats --no-stream --format "$ts {{.Name}} {{.CPUPerc}} {{.MemUsage}}" | grep -E "lawbid-lt|lt-k6|lt-pg" >> "$res/stats.log"
    echo "$ts temp $(sensors 2>/dev/null | awk '/Package id 0/{print $4}')" >> "$res/temp.log"
    sleep 10
  done ) &
sampler=$!
docker run --rm --name "lt-k6-$name" --user "$(id -u):$(id -g)" --network host --ulimit nofile=200000:200000 --cpus 4 \
  -v "$repo/loadtest:/lt:ro" -v "$res:/out" \
  -e PROFILE=local -e ALLOW_LOCAL=1 -e API_URL=http://127.0.0.1:3055/api/v1 -e STAFF_FILE=/out/staff.json \
  -e VUS="${VUS:-$n}" -e HOLD="${HOLD:-3m}" -e RAMP="${RAMP:-1m}" \
  grafana/k6:2.0.0 run --no-color --summary-export /out/summary.json /lt/k6/staff.js > "$res/k6.log" 2>&1
rc=$?
kill $sampler 2>/dev/null
"${PGSS_DUMP:-$here/pgss_dump.sh}" "$DB" "$res" >/dev/null 2>&1 || true
python3 "$here/lease_check.py" "$res/k6.log" | tail -5 | tee "$res/lease_check.txt"
echo "k6 exit $rc -> $res"
