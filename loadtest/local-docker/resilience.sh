#!/usr/bin/env bash
# One vus.js run with a per-10 s time series (k6-series.py), a 5 s resource /
# health sampler and an optional outage in the middle:
#   resilience.sh <name> <fixtures dir> VUS=.. WS=.. HOLD=.. RAMP=.. [OUT_SVC=postgres|redis] [OUT_AT=120] [OUT_FOR=40] [NO_K6_ABORT=1]
# OUT_SVC: that compose service's container is `docker stop`ped OUT_AT seconds
# after k6 starts and `docker start`ed OUT_FOR seconds later (outage.log).
# Sampler (sample.log, every 5 s): docker stats of the stack, Postgres
# connections (active|total), Redis clients / memory / ops, /health/ready and
# /health/live status + latency from the host.
set -uo pipefail
name="$1"; fx="$2"; shift 2
for kv in "$@"; do export "$kv"; done
res="${RESULTS:-$HOME/loadtest/results}/$name"; mkdir -p "$res"
here="$(cd "$(dirname "$0")" && pwd)"; repo="${REPO:-$(cd "$here/../.." && pwd)}"
PG="docker exec lawbid-lt-postgres-1 psql -U root -d ${DB:-lawbid_lt} -tAq"
$PG -c "select pg_stat_statements_reset()" >/dev/null 2>&1
( while true; do
    ts=$(date +%T)
    docker stats --no-stream --format "$ts {{.Name}} {{.CPUPerc}} {{.MemUsage}}" 2>/dev/null | grep -E "lawbid-lt|lt-k6" >> "$res/stats.log"
    echo "$ts pg $($PG -c "select count(*) filter (where state='active')||'|'||count(*) from pg_stat_activity where datname is not null" 2>/dev/null || echo 'down')" >> "$res/sample.log"
    echo "$ts redis $(docker exec lawbid-lt-redis-1 redis-cli info clients 2>/dev/null | grep -E '^connected_clients' | tr -d '\r') $(docker exec lawbid-lt-redis-1 redis-cli info memory 2>/dev/null | grep -E '^used_memory_human' | tr -d '\r') $(docker exec lawbid-lt-redis-1 redis-cli info stats 2>/dev/null | grep -E '^instantaneous_ops_per_sec' | tr -d '\r')" >> "$res/sample.log"
    echo "$ts ready $(curl -s -o /dev/null -m 5 -w '%{http_code} %{time_total}' http://127.0.0.1:3055/health/ready) live $(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:3055/health/live)" >> "$res/sample.log"
    sleep 5
  done ) &
sampler=$!
if [ -n "${OUT_SVC:-}" ]; then
  ( sleep "${OUT_AT:-120}"; c="lawbid-lt-${OUT_SVC}-1"
    echo "$(date +%T.%N | cut -c1-12) STOP $c" >> "$res/outage.log"; docker stop -t 5 "$c" >/dev/null
    echo "$(date +%T.%N | cut -c1-12) STOPPED $c" >> "$res/outage.log"; sleep "${OUT_FOR:-40}"
    echo "$(date +%T.%N | cut -c1-12) START $c" >> "$res/outage.log"; docker start "$c" >/dev/null
    echo "$(date +%T.%N | cut -c1-12) STARTED $c" >> "$res/outage.log"
    for i in $(seq 1 300); do curl -fs -m 2 http://127.0.0.1:3055/health/ready >/dev/null 2>&1 && { echo "$(date +%T.%N | cut -c1-12) READY_OK after ${i}s" >> "$res/outage.log"; break; }; sleep 1; done ) &
  outage=$!
fi
docker rm -f "lt-k6-$name" >/dev/null 2>&1
echo "$(date +%T) k6 start" >> "$res/outage.log"
docker run --rm --name "lt-k6-$name" --user "$(id -u):$(id -g)" --network host --ulimit nofile=200000:200000 --cpus "${K6_CPUS:-6}" \
  -v "$repo/loadtest:/lt:ro" -v "$fx:/fx:ro" -v "$res:/out" \
  -e PROFILE=local -e ALLOW_LOCAL=1 -e API_URL=http://127.0.0.1:3055/api/v1 -e WS_URL=ws://127.0.0.1:3055 \
  -e TOKENS_FILE=/fx/tokens.json -e FIXTURES_FILE=/fx/fixtures.json \
  -e VUS="${VUS:-100}" -e WS="${WS:-0}" -e HOLD="${HOLD:-4m}" -e RAMP="${RAMP:-1m}" -e WS_HOLD_SECONDS="${WS_HOLD_SECONDS:-300}" \
  -e SKIP_ACTIONS="${SKIP_ACTIONS:-}" -e WRITES="${WRITES:-0}" -e NO_K6_ABORT="${NO_K6_ABORT:-0}" \
  grafana/k6:2.0.0 run --quiet --no-color --summary-export /out/summary.json --out json=/dev/stdout /lt/k6/vus.js 2> "$res/k6.log" \
  | python3 "$here/k6-series.py" 10 > "$res/series.csv"
rc=${PIPESTATUS[0]}
echo "$(date +%T) k6 exit $rc" >> "$res/outage.log"
kill $sampler 2>/dev/null; [ -n "${outage:-}" ] && wait $outage 2>/dev/null
$PG -F '|' -c "select calls, round(total_exec_time)::bigint, round(mean_exec_time::numeric,2), round(max_exec_time::numeric,1), rows, left(regexp_replace(query,'\s+',' ','g'),300) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) order by total_exec_time desc limit 30" > "$res/pgss_top.txt" 2>/dev/null
echo "k6 exit $rc -> $res"
exit $rc
