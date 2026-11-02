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
#   auth  login storm up to 100 sign-ins per second (needs api-auth.env: AUTH_TEST=1 ./make-env.sh).
#         It sets the SMS caps in app_config for the run and removes them afterwards (on failure too).
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

scale_api() {  # scale_api <n> [env file]; returns when all n replicas answer through the balancer
  n="$1"
  ( cd "$here" && API_ENV="${2:-./api.env}" docker compose up -d --no-deps --force-recreate --scale api="$n" api worker >/dev/null \
    && docker compose restart lb >/dev/null ) || return 1
  for _ in $(seq 1 90); do
    up="$(cd "$here" && docker compose ps --status running -q api | wc -l)"
    [ "$up" -ge "$n" ] && break; sleep 2
  done
  [ "$up" -ge "$n" ] || { echo "only $up of $n API replicas are running"; return 1; }
  ok=0   # n x 10 answers in a row through the balancer (least_conn spreads them over all replicas)
  for _ in $(seq 1 240); do
    if curl -fs http://127.0.0.1:3055/health/live >/dev/null 2>&1; then ok=$((ok+1)); else ok=0; sleep 1; fi
    [ "$ok" -ge $((n*10)) ] && return 0
  done
  echo "API did not become healthy after scaling to $n"; return 1
}

# SMS caps and abuse guards are database settings (app_config); the login storm
# needs them out of the way. Set for the auth rung, removed afterwards (also on failure).
AUTH_CFG=(
  "budget.sms.per_minute_max=1000000" "budget.sms.daily_max=1000000" "budget.sms.monthly_max=1000000"
  "budget.sms.daily_cents=1000000000" "budget.sms.monthly_cents=1000000000"
  "sms.prefix_velocity_max=1000000" "sms.country_velocity_max=1000000" "sms.signup_daily_cap=0"
  "sms.registration_per_number_per_day=1000" "sms.resend_cooldown_seconds=0"
  "security.otp_per_identifier_per_day=1000000" "sms.cap_mode=\"fixed\""
)
DBX="docker exec -i lawbid-lt-postgres-1 psql -U root -d ${DB:-lawbid_lt} -v ON_ERROR_STOP=1 -q"
auth_cfg_on() {
  { for kv in "${AUTH_CFG[@]}"; do echo "INSERT INTO app_config(key,value,updated_at) VALUES ('${kv%%=*}','${kv#*=}'::jsonb,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();"; done; } | $DBX
}
auth_cfg_off() {
  { printf "DELETE FROM app_config WHERE key IN ("; sep=""; for kv in "${AUTH_CFG[@]}"; do printf "%s'%s'" "$sep" "${kv%%=*}"; sep=","; done; echo ");"; } | $DBX
  scale_api 8 ./api.env
}
auth_restore=0
trap '[ "$auth_restore" = 1 ] && auth_cfg_off' EXIT

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
      auth_restore=1; auth_cfg_on || exit 1
      scale_api 4 ./api-auth.env || exit 1
      res="$RESULTS/$name"; mkdir -p "$res"
      # container name lt-k6-* so that watch.sh (heat / RAM / disk) can pause or stop it
      docker rm -f "lt-k6-$name" >/dev/null 2>&1
      docker run --name "lt-k6-$name" --user "$(id -u):$(id -g)" --network host --cpus 4 -v "$here/../:/lt:ro" -v "$res:/out" \
        -e ALLOW_LOCAL=1 -e K6_SMS_ALLOWED=true -e API_URL=http://127.0.0.1:3055/api/v1 \
        -e LOGIN_RATE="${LOGIN_RATE:-100}" -e RAMP=1m -e HOLD=3m -e PHONE_OFFSET="${PHONE_OFFSET:-0}" \
        grafana/k6:2.0.0 run --no-color --summary-export /out/summary.json /lt/k6/auth.js > "$res/k6.log" 2>&1
      rc=$?; docker rm "lt-k6-$name" >/dev/null 2>&1; tail -30 "$res/k6.log"; (exit $rc) ;;
    *) echo "unknown rung $rung"; exit 2 ;;
  esac
  rc=$?
  if [ "$rung" != auth ]; then python3 "$here/summarize.py" "$RESULTS/$name" 2>/dev/null | head -40; fi
  if [ $rc -ne 0 ]; then echo "=== rung $rung FAILED (code $rc). Results: $RESULTS/$name. Stopping."; exit 1; fi
  echo "=== rung $rung passed. Results: $RESULTS/$name"
  [ "$rung" = auth ] && { auth_cfg_off; auth_restore=0; }  # normal settings back
done
echo "=== all rungs passed"
