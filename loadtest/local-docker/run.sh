#!/usr/bin/env bash
# One closed-model k6 run (loadtest/k6/vus.js) against the local stack, k6 in
# Docker (container lt-k6-<name>, paused/stopped by guard/watch.sh), plus a
# resource sampler (docker stats + Postgres + Redis every 10 s).
#   run.sh <name> <fixtures dir> VUS=.. [WS=..] [HOLD=4m] [RAMP=1m]
set -uo pipefail
name="$1"; fx="$2"; shift 2
# shellcheck disable=SC2163  # each argument is KEY=VALUE
for kv in "$@"; do export "$kv"; done
res="${RESULTS:-$HOME/loadtest/results}/$name"; mkdir -p "$res"
repo="${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
PG="docker exec lawbid-lt-postgres-1 psql -U root -d ${DB:-lawbid_lt} -tAq"
$PG -c "select pg_stat_statements_reset()" >/dev/null
$PG -c "select pg_stat_reset()" >/dev/null
( while true; do
    ts=$(date +%T)
    docker stats --no-stream --format "$ts {{.Name}} {{.CPUPerc}} {{.MemUsage}}" | grep -E "lawbid-lt|lt-k6" >> "$res/stats.log"
    echo "$ts pg $($PG -c "select count(*) filter (where state='active'), count(*) from pg_stat_activity where datname is not null")" >> "$res/pg.log"
    echo "$ts redis $(docker exec lawbid-lt-redis-1 redis-cli info memory | grep -E '^used_memory_human' | tr -d '\r') $(docker exec lawbid-lt-redis-1 redis-cli info stats | grep -E '^instantaneous_ops_per_sec' | tr -d '\r')" >> "$res/redis.log"
    echo "$ts temp $(sensors 2>/dev/null | awk '/Package id 0/{print $4}')" >> "$res/temp.log"
    sleep 10
  done ) &
sampler=$!
docker rm -f "lt-k6-$name" >/dev/null 2>&1
docker run --name "lt-k6-$name" --user "$(id -u):$(id -g)" --network host --ulimit nofile=200000:200000 --cpus "${K6_CPUS:-6}" \
  -v "$repo/loadtest:/lt:ro" -v "$fx:/fx:ro" -v "$res:/out" \
  -e PROFILE=local -e ALLOW_LOCAL=1 -e API_URL=http://127.0.0.1:3055/api/v1 -e WS_URL=ws://127.0.0.1:3055 \
  -e TOKENS_FILE=/fx/tokens.json -e FIXTURES_FILE=/fx/fixtures.json \
  -e VUS="${VUS:-100}" -e WS="${WS:-0}" -e HOLD="${HOLD:-4m}" -e RAMP="${RAMP:-1m}" -e WS_HOLD_SECONDS="${WS_HOLD_SECONDS:-300}" \
  -e SKIP_ACTIONS="${SKIP_ACTIONS:-}" -e NO_K6_ABORT="${NO_K6_ABORT:-0}" \
  grafana/k6:2.0.0 run --no-color --summary-export /out/summary.json /lt/k6/vus.js > "$res/k6.log" 2>&1
rc=$?
kill $sampler 2>/dev/null
$PG -F '|' -c "select calls, round(total_exec_time)::bigint, round(mean_exec_time::numeric,2), round(max_exec_time::numeric,1), rows, shared_blks_read, left(regexp_replace(query,'\s+',' ','g'),400) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) order by total_exec_time desc limit 40" > "$res/pgss_top.txt"
$PG -F '|' -c "select relname, seq_scan, seq_tup_read, idx_scan from pg_stat_user_tables order by seq_tup_read desc limit 15" > "$res/seqscans.txt"
docker logs --since 15m lawbid-lt-postgres-1 2>&1 | grep -E "duration:" | tail -200 > "$res/pg-slow.log"
docker rm "lt-k6-$name" >/dev/null 2>&1
echo "k6 exit $rc -> $res"
exit $rc
