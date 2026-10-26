#!/usr/bin/env sh
# docs/06 §7.3 smoke: readiness (DB + Redis), the public bootstrap, the admin
# login page. Any failure fails the job (and, on prod, the ECS circuit breaker
# has already kept the previous revision if tasks were unhealthy).
#
# S11-5: with an EXPECTED TAG (third argument) it also proves that the answering
# API tasks run THAT release: /health/ready returns `version` (APP_VERSION =
# the image tag, set by roll-services.sh). The ALB spreads requests over old
# and new tasks during a rollout, so it asks until EXPECTED_STREAK answers in a
# row carry the tag (default 12, ~5 s apart) within SMOKE_VERSION_SECONDS
# (default 600). An older API image without `version` fails this check on
# purpose: the tag could not be verified.
#   smoke.sh <api url> <admin url> [expected tag]
set -eu
API="$1"; ADMIN="$2"; WANT="${3:-}"
for i in 1 2 3 4 5 6; do
  if curl -fsS "$API/health/ready" >/dev/null; then break; fi
  [ "$i" = 6 ] && { echo "health/ready failed" >&2; exit 1; }
  sleep 10
done
if [ -n "$WANT" ]; then
  STREAK_NEED="${EXPECTED_STREAK:-12}"; LIMIT="${SMOKE_VERSION_SECONDS:-600}"
  start=$(date +%s); streak=0; seen=""
  while [ "$streak" -lt "$STREAK_NEED" ]; do
    GOT=$(curl -fsS --max-time 10 "$API/health/ready" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).version||"")}catch{console.log("")}})' || true)
    if [ "$GOT" = "$WANT" ]; then streak=$((streak + 1)); else streak=0; seen="$GOT"; fi
    if [ $(( $(date +%s) - start )) -ge "$LIMIT" ]; then
      echo "::error::API still answers version '${seen:-none}' instead of $WANT after ${LIMIT}s" >&2
      exit 1
    fi
    [ "$streak" -lt "$STREAK_NEED" ] && sleep 5
  done
  echo "version ok: $STREAK_NEED answers in a row from $WANT"
fi
curl -fsS "$API/api/v1/config/bootstrap" >/dev/null
curl -fsS -o /dev/null -w "%{http_code}\n" "$ADMIN/login" | grep -Eq '^(200|30[0-9])$'
echo "smoke ok"
