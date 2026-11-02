#!/usr/bin/env bash
# Per-action cost of the full mix (MIX=full): for each action, N people with
# no think time for a short window, and from the container cgroup counters:
# API CPU ms, Postgres CPU ms, SQL statements and Redis commands per request.
# This is "API CPU per endpoint" without per-request timing logs.
#   calib.sh <out dir> <fixtures dir> [VUS=40] [SECS=25] [DB=lawbid_lt] [ACTIONS="feed chat_list ..."]
set -uo pipefail
out="$1"; fx="$2"; shift 2
for kv in "$@"; do export "$kv"; done
mkdir -p "$out"
repo="${REPO:-$HOME/LawBid-build}"
DB="${DB:-lawbid_lt}"
PG="docker exec ${PG_CONTAINER:-lawbid-lt-postgres-1} psql -U root -d $DB -tAq"
ACTIONS="${ACTIONS:-cold_start settings verification feed reels post_open like comment profile follow search cases_feed my_cases my_offers deal case_create chat_list chat_open chat_send upload calls notifications admin}"
cpu_us() { # summed CPU microseconds of the containers whose name matches $1
  local t=0 id u
  for id in $(docker ps -q --no-trunc --filter "name=$1"); do
    u=$(awk '/^usage_usec/{print $2}' "/sys/fs/cgroup/system.slice/docker-$id.scope/cpu.stat" 2>/dev/null || echo 0)
    t=$((t + u))
  done
  echo "$t"
}
redis_cmds() { docker exec lawbid-lt-redis-1 redis-cli info stats | awk -F: '/^total_commands_processed/{print $2+0}'; }
printf '%-14s %8s %7s %9s %9s %8s %8s %8s\n' action reqs req/s api_ms/r pg_ms/r sql/r redis/r p95_ms | tee "$out/calib.txt"
for a in $ACTIONS; do
  $PG -c "select pg_stat_statements_reset()" >/dev/null
  a0=$(cpu_us lawbid-lt-api-); p0=$(cpu_us "${PG_CONTAINER:-lawbid-lt-postgres-1}"); r0=$(redis_cmds)
  docker run --rm --name "lt-k6-calib" --user "$(id -u):$(id -g)" --network host --cpus 4 \
    -v "$repo/loadtest:/lt:ro" -v "$fx:/fx:ro" -v "$out:/out" \
    -e PROFILE=local -e ALLOW_LOCAL=1 -e API_URL=http://127.0.0.1:3055/api/v1 -e WS_URL=ws://127.0.0.1:3055 \
    -e TOKENS_FILE=/fx/tokens.json -e FIXTURES_FILE=/fx/fixtures.json -e MIX=full -e ONLY_ACTIONS="$a" \
    -e VUS="${VUS:-40}" -e RAMP=3s -e HOLD="${SECS:-25}s" -e THINK_MIN=0 -e THINK_MAX=0.05 -e NO_K6_ABORT=1 \
    grafana/k6:2.0.0 run --quiet --no-color --summary-export "/out/$a.json" /lt/k6/vus.js > "$out/$a.log" 2>&1
  a1=$(cpu_us lawbid-lt-api-); p1=$(cpu_us "${PG_CONTAINER:-lawbid-lt-postgres-1}"); r1=$(redis_cmds)
  $PG -F '|' -c "select calls, round(total_exec_time)::bigint, round(mean_exec_time::numeric,3), left(regexp_replace(query, '\s+', ' ', 'g'), 260) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) order by calls desc limit 30" > "$out/$a.pgss" 2>/dev/null
  sql=$($PG -c "select coalesce(sum(calls),0) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) and query not ilike '%pg_stat_statements%'")
  python3 - "$out/$a.json" "$a" "$a0" "$a1" "$p0" "$p1" "$r0" "$r1" "$sql" <<'PY' | tee -a "$out/calib.txt"
import json, sys
f, a, a0, a1, p0, p1, r0, r1, sql = sys.argv[1:]
m = json.load(open(f))['metrics']
n = m['http_reqs']['count'] or 1
dur = m['http_reqs']['count'] / max(m['http_reqs']['rate'], 1e-9)
print(f"{a:14} {n:8d} {m['http_reqs']['rate']:7.0f} {(int(a1)-int(a0))/1000/n:9.2f} {(int(p1)-int(p0))/1000/n:9.2f} {int(sql)/n:8.1f} {(int(r1)-int(r0))/n:8.1f} {m['http_req_duration']['p(95)']:8.0f}")
PY
  sleep 3
done
