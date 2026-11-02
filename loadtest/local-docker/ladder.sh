#!/usr/bin/env bash
# The load ladder on the laptop (docs/perf/LOAD_LADDER_2026-11-02.md): rungs of
# growing size, one after another, stops at the first rung that fails.
#
#   ladder.sh <fixtures dir> <rung> [<rung> ...]
#   rungs: r100  r1k  r3k  s10k  auth  (r1k+writes: r1kw)
#
#   r100  100 people            2 API   (does the whole chain work at all)
#   r1k   1 000 people + 200 sockets    8 API    (last measured: passed, 513 req/s)
#   r1kw  r1k + posts being published   8 API
#   r3k   3 000 people + 1 000 sockets 16 API    (the laptop's honest ceiling)
#   s10k  2 000 people + 10 000 held sockets, 16 API (realtime fan-out, light on CPU)
#   auth  login storm 20 -> 100 sign-ins per second (needs api-auth.env, see make-env.sh)
#
# Needs the stack up (compose.yml), the database seeded (seed.sh) and test
# accounts made by `prepare.sh <fixtures dir> 12000 3000 0` (each person may
# make only 100 requests a minute, so there must be more accounts than people).
# Exit code: 0 all rungs passed, 1 a rung failed (k6 stopped it or a threshold missed).
set -uo pipefail
fx="${1:?fixtures dir (made by prepare.sh)}"; shift
[ $# -gt 0 ] || { echo "no rungs given"; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
export RESULTS="${RESULTS:-$HOME/loadtest/results}"
stamp="$(date +%m%d-%H%M)"

scale_api() {  # scale_api <n> [env file]
  ( cd "$here" && API_ENV="${2:-./api.env}" docker compose up -d --no-deps --force-recreate --scale api="$1" api worker >/dev/null \
    && docker compose restart lb >/dev/null )
  for _ in $(seq 1 60); do curl -fs http://127.0.0.1:3055/health/live >/dev/null 2>&1 && return 0; sleep 2; done
  echo "API did not come up after scaling to $1"; return 1
}

for rung in "$@"; do
  name="$stamp-$rung"
  echo "=== rung $rung  $(date +%T)"
  case "$rung" in
    r100)  scale_api 2  && "$here/run.sh" "$name" "$fx" VUS=100  WS=50   HOLD=2m RAMP=30s ;;
    r1k)   scale_api 8  && "$here/run.sh" "$name" "$fx" VUS=1000 WS=200  HOLD=4m RAMP=1m ;;
    r1kw)  scale_api 8  && "$here/run.sh" "$name" "$fx" VUS=1000 WS=200  HOLD=4m RAMP=1m WRITES=1 ;;
    r3k)   scale_api 16 && "$here/run.sh" "$name" "$fx" VUS=3000 WS=1000 HOLD=5m RAMP=3m ;;
    s10k)  scale_api 16 && "$here/run.sh" "$name" "$fx" VUS=2000 WS=10000 HOLD=5m RAMP=4m WS_HOLD_SECONDS=600 ;;
    auth)
      [ -f "$here/api-auth.env" ] || { echo "no api-auth.env: run  AUTH_TEST=1 ./make-env.sh"; exit 2; }
      scale_api 4 ./api-auth.env || exit 1
      res="$RESULTS/$name"; mkdir -p "$res"
      docker run --rm --user "$(id -u):$(id -g)" --network host --cpus 4 -v "$here/../:/lt:ro" -v "$res:/out" \
        -e ALLOW_LOCAL=1 -e K6_SMS_ALLOWED=true -e API_URL=http://127.0.0.1:3055/api/v1 \
        -e LOGIN_RATE="${LOGIN_RATE:-100}" -e RAMP=1m -e HOLD=3m -e PHONE_OFFSET="${PHONE_OFFSET:-0}" \
        grafana/k6:2.0.0 run --no-color --summary-export /out/summary.json /lt/k6/auth.js > "$res/k6.log" 2>&1
      rc=$?; tail -25 "$res/k6.log"; (exit $rc) ;;
    *) echo "unknown rung $rung"; exit 2 ;;
  esac
  rc=$?
  if [ "$rung" != auth ]; then python3 "$here/summarize.py" "$RESULTS/$name" 2>/dev/null | head -40; fi
  if [ $rc -ne 0 ]; then echo "=== rung $rung FAILED (code $rc). Results: $RESULTS/$name. Stopping."; exit 1; fi
  echo "=== rung $rung passed. Results: $RESULTS/$name"
  # back to the normal env after the auth rung
  [ "$rung" = auth ] && scale_api 8 ./api.env
done
echo "=== all rungs passed"
