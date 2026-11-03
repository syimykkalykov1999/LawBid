#!/usr/bin/env bash
# One closed-model k6 run (loadtest/k6/vus.js) against the local stack, k6 in
# Docker (container lt-k6-<name>, paused/stopped by guard/watch.sh), with:
#   * series.csv - a per-10 s time series reduced from the k6 JSON stream by
#     k6-series.py (requests, errors by status, p50/p95/p99, sockets, chat delivery);
#   * a resource / health sampler every SAMPLE_EVERY s (10): stats.log (docker
#     stats), pg.log (connections active|total), redis.log (clients, memory,
#     ops/s), health.log (/health/ready status + latency, /health/live), temp.log;
#   * an optional outage: OUT_SVC=postgres|redis stops that compose service
#     OUT_AT s (120) after k6 starts and starts it OUT_FOR s (40) later;
#     outage.log has the timestamps and the time until /health/ready is 200.
#   run.sh <name> <fixtures dir> VUS=.. [WS=..] [HOLD=4m] [RAMP=1m] [NO_K6_ABORT=1]
#          [OUT_SVC=postgres OUT_AT=120 OUT_FOR=40] [SAMPLE_EVERY=10]
# After the run: summarize.py <results dir> (totals), soak-report.py (trend).
set -uo pipefail
name="$1"; fx="$2"; shift 2
# shellcheck disable=SC2163  # each argument is KEY=VALUE
for kv in "$@"; do export "$kv"; done
res="${RESULTS:-$HOME/loadtest/results}/$name"; mkdir -p "$res"
here="$(cd "$(dirname "$0")" && pwd)"; repo="${REPO:-$(cd "$here/../.." && pwd)}"
PG="docker exec ${PG_CONTAINER:-lawbid-lt-postgres-1} psql -U root -d ${DB:-lawbid_lt} -tAq"
API=http://127.0.0.1:3055
log() { local f="$1"; shift; echo "$(date +%T.%3N) $*" >> "$res/$f"; }
$PG -c "select pg_stat_statements_reset()" >/dev/null
$PG -c "select pg_stat_reset()" >/dev/null

# The probes run in parallel and each stamps its own line: docker stats alone
# takes ~2 s and a curl to a dead API 5 s, which would stretch and skew the period.
every="${SAMPLE_EVERY:-10}"
( while true; do
    t0=$(date +%s)
    { docker stats --no-stream --format "$(date +%T) {{.Name}} {{.CPUPerc}} {{.MemUsage}}" 2>/dev/null | grep -E "lawbid-lt|lt-k6" >> "$res/stats.log"; } &
    { log pg.log "pg $($PG -c "select count(*) filter (where state='active'), count(*) from pg_stat_activity where datname is not null" 2>/dev/null || echo down)"; } &
    { r=$(docker exec lawbid-lt-redis-1 redis-cli info 2>/dev/null | grep -E '^(connected_clients|used_memory_human|instantaneous_ops_per_sec):' | tr -d '\r' | paste -sd' '); log redis.log "redis ${r:-down}"; } &
    { log health.log "ready $(curl -s -o /dev/null -m 5 -w '%{http_code} %{time_total}' "$API/health/ready") live $(curl -s -o /dev/null -m 5 -w '%{http_code}' "$API/health/live")"; } &
    log temp.log "temp $(sensors 2>/dev/null | awk '/Package id 0/{print $4}')"
    wait
    el=$(( $(date +%s) - t0 )); sleep $(( el < every ? every - el : 0 ))
  done ) &
sampler=$!

if [ -n "${OUT_SVC:-}" ]; then
  ( sleep "${OUT_AT:-120}"
    log outage.log "STOP $OUT_SVC"; docker compose -f "$here/compose.yml" stop -t 5 "$OUT_SVC" >/dev/null 2>&1; log outage.log "STOPPED $OUT_SVC"
    sleep "${OUT_FOR:-40}"
    log outage.log "START $OUT_SVC"; docker compose -f "$here/compose.yml" start "$OUT_SVC" >/dev/null 2>&1; log outage.log "STARTED $OUT_SVC"
    for i in $(seq 1 300); do curl -fs -m 2 "$API/health/ready" >/dev/null 2>&1 && { log outage.log "READY_OK after ${i}s"; break; }; sleep 1; done ) &
  outage=$!
fi

docker rm -f "lt-k6-$name" >/dev/null 2>&1
log run.log "k6 start"
# k6's stdout is the JSON point stream (series), its stderr and the end-of-test
# summary (passed through by k6-series.py) go to k6.log.
: > "$res/k6.log"
docker run --rm --name "lt-k6-$name" --user "$(id -u):$(id -g)" --network host --ulimit nofile=200000:200000 --cpus "${K6_CPUS:-6}" \
  -v "$repo/loadtest:/lt:ro" -v "$fx:/fx:ro" -v "$res:/out" \
  -e PROFILE=local -e ALLOW_LOCAL=1 -e API_URL=$API/api/v1 -e WS_URL=ws://127.0.0.1:3055 \
  -e TOKENS_FILE=/fx/tokens.json -e FIXTURES_FILE=/fx/fixtures.json \
  -e VUS="${VUS:-100}" -e RPS="${RPS:-0}" -e WS="${WS:-0}" -e HOLD="${HOLD:-4m}" -e RAMP="${RAMP:-1m}" -e WS_HOLD_SECONDS="${WS_HOLD_SECONDS:-300}" \
  -e SKIP_ACTIONS="${SKIP_ACTIONS:-}" -e WRITES="${WRITES:-0}" -e NO_K6_ABORT="${NO_K6_ABORT:-0}" -e MIX="${MIX:-}" -e ONLY_ACTIONS="${ONLY_ACTIONS:-}" \
  grafana/k6:2.0.0 run --quiet --no-color --summary-export /out/summary.json --out json=/dev/stdout /lt/k6/vus.js 2>> "$res/k6.log" \
  | python3 "$here/k6-series.py" > "$res/series.csv" 2>> "$res/k6.log"
rc=${PIPESTATUS[0]}
log run.log "k6 exit $rc"
kill $sampler 2>/dev/null
if [ -n "${outage:-}" ]; then
  # k6 ended (threshold abort) before the outage began: cancel it instead of
  # stopping the stand under whatever runs next
  if grep -q ' STOP ' "$res/outage.log" 2>/dev/null; then wait $outage 2>/dev/null
  else pkill -P $outage 2>/dev/null; kill $outage 2>/dev/null; log outage.log "CANCELLED: k6 ended before OUT_AT"; fi
fi
$PG -F '|' -c "select calls, round(total_exec_time)::bigint, round(mean_exec_time::numeric,2), round(max_exec_time::numeric,1), rows, shared_blks_read, left(regexp_replace(query,'\s+',' ','g'),400) from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) order by total_exec_time desc limit 40" > "$res/pgss_top.txt"
$PG -F '|' -c "select relname, seq_scan, seq_tup_read, idx_scan from pg_stat_user_tables order by seq_tup_read desc limit 15" > "$res/seqscans.txt"
docker logs --since 15m "${PG_CONTAINER:-lawbid-lt-postgres-1}" 2>&1 | grep -E "duration:" | tail -200 > "$res/pg-slow.log"
echo "k6 exit $rc -> $res"
exit $rc
