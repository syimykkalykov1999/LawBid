#!/usr/bin/env bash
# The round-2 sequence of docs/perf/LOCAL_LOAD_TEST_2026-10-28.md after the
# 10M seed (seed.sh 100 lawbid_lt10): 1M before/after, staff before/after,
# per-action calibration, then the 10M runs. Images: lawbid-lt-api-dev:<BASE>
# (before) and :<FIX> (after). Results in ~/loadtest/results/<run>.
#   round2.sh <fixtures dir 1M> [BASE=r2] [FIX=r2fix] [STEPS="base fix staff calib 10m"]
#   PG1M=lt-pg1m: the 1M steps use that Postgres container (a copy of
#   lawbid_lt, 2 CPU) so they can run while the 10M seed keeps
#   lawbid-lt-postgres-1 busy; the 10m step uses lawbid-lt-postgres-1.
set -uo pipefail
fx="$1"; shift
for kv in "$@"; do export "$kv"; done
here="$(cd "$(dirname "$0")" && pwd)"; export REPO="${REPO:-$(cd "$here/../.." && pwd)}"
stack="${STACK:-$HOME/loadtest/stack}"; res="$HOME/loadtest/results"
BASE="${BASE:-r2}"; FIX="${FIX:-r2fix}"; STEPS="${STEPS:-base fix staff calib 10m}"
log() { echo "== $(date +%T) $*"; }
use_image() {
  docker tag "lawbid-lt-api-dev:$1" lawbid-lt-api-dev:local
  (cd "$stack" && docker compose up -d --scale api=8 api worker >/dev/null 2>&1)
  sleep 5; until curl -sf http://127.0.0.1:3055/health/live >/dev/null; do sleep 2; done; sleep 10
  log "API image $1"
}
use_db() { # <host> <database>
  sed -i -E "s#@[a-z0-9_-]+:5432/lawbid_lt[a-z0-9_]*#@$1:5432/$2#" "$stack/compose.yml" "$stack/api.env"
  (cd "$stack" && docker compose up -d --scale api=8 >/dev/null 2>&1)
  sleep 5; until curl -sf http://127.0.0.1:3055/health/live >/dev/null; do sleep 2; done; sleep 10
  log "database $1/$2"
}
PG1M="${PG1M:-lawbid-lt-postgres-1}"
pg_host() { [ "$1" = lawbid-lt-postgres-1 ] && echo postgres || echo "$1"; }
export PG_CONTAINER="$PG1M"
docker update --cpus 2 --memory 16g --memory-swap 16g "$PG1M" >/dev/null
docker exec "$PG1M" psql -U root -d postgres -q -c "alter system set pg_stat_statements.track_planning = on" -c "select pg_reload_conf()" >/dev/null
use_db "$(pg_host "$PG1M")" lawbid_lt
for step in $STEPS; do
  case "$step" in
    base)
      use_image "$BASE"
      "$here/run.sh" r2-base-1000b "$fx" VUS=1000 WS=200 HOLD=4m RAMP=1m MIX=full NO_K6_ABORT=1 > "$res/r2-base-1000b.out" 2>&1
      "$here/pgss_dump.sh" lawbid_lt "$res/r2-base-1000b" >/dev/null
      "$here/run.sh" r2-base-3000 "$fx" VUS=3000 WS=300 HOLD=3m RAMP=3m MIX=full > "$res/r2-base-3000.out" 2>&1
      "$here/pgss_dump.sh" lawbid_lt "$res/r2-base-3000" >/dev/null ;;
    fix)
      use_image "$FIX"
      "$here/run.sh" r2-fix-1000 "$fx" VUS=1000 WS=200 HOLD=4m RAMP=1m MIX=full NO_K6_ABORT=1 > "$res/r2-fix-1000.out" 2>&1
      "$here/pgss_dump.sh" lawbid_lt "$res/r2-fix-1000" >/dev/null
      "$here/run.sh" r2-fix-3000 "$fx" VUS=3000 WS=300 HOLD=3m RAMP=3m MIX=full > "$res/r2-fix-3000.out" 2>&1
      "$here/pgss_dump.sh" lawbid_lt "$res/r2-fix-3000" >/dev/null ;;
    staff)
      use_image "$BASE"
      "$here/staff.sh" st-base2-1000 1000 VUS=1000 HOLD=3m RAMP=1m > "$res/st-base2-1000.out" 2>&1
      use_image "$FIX"
      for n in 50 200 1000; do
        "$here/staff.sh" "st-fix-$n" "$n" VUS="$n" HOLD=3m RAMP=1m > "$res/st-fix-$n.out" 2>&1
      done ;;
    calib)
      use_image "$FIX"
      "$here/calib.sh" "$res/calib-fix" "$fx" VUS=40 SECS=25 \
        ACTIONS="cold_start settings verification feed reels post_open like comment profile follow search cases_feed my_cases my_offers deal case_create chat_list chat_open chat_send web_chats upload calls notifications admin" > "$res/calib-fix.out" 2>&1 ;;
    10m)
      export PG_CONTAINER=lawbid-lt-postgres-1
      docker update --cpus 2 --memory 16g --memory-swap 16g lawbid-lt-postgres-1 >/dev/null
      for f in licenses.sql deals.sql; do
        docker exec -i lawbid-lt-postgres-1 psql -U root -d lawbid_lt10 -q < "$here/$f" > "$res/lt10-$f.log" 2>&1
      done
      use_image "$FIX"
      use_db postgres lawbid_lt10
      mkdir -p "$res/fx-10m"
      DB=lawbid_lt10 "$here/prepare.sh" "$res/fx-10m" 6000 1500 1 > "$res/fx-10m.out" 2>&1
      "$here/run.sh" r2-10m-1000 "$res/fx-10m" DB=lawbid_lt10 VUS=1000 WS=200 HOLD=4m RAMP=1m MIX=full NO_K6_ABORT=1 > "$res/r2-10m-1000.out" 2>&1
      "$here/pgss_dump.sh" lawbid_lt10 "$res/r2-10m-1000" >/dev/null
      "$here/run.sh" r2-10m-3000 "$res/fx-10m" DB=lawbid_lt10 VUS=3000 WS=300 HOLD=3m RAMP=3m MIX=full > "$res/r2-10m-3000.out" 2>&1
      "$here/pgss_dump.sh" lawbid_lt10 "$res/r2-10m-3000" >/dev/null
      export PG_CONTAINER="$PG1M"; use_db "$(pg_host "$PG1M")" lawbid_lt ;;
  esac
  log "step $step done"
done
log "round 2 done"
