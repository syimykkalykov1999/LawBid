#!/usr/bin/env bash
# Combat-run drills (owner row 59, docs/dev/AWS_COMBAT_TEST_PLAN_2026-11-13.md).
# Runs on the GitHub runner beside the load of profile `combat` (started in the
# background by .github/workflows/load-test.yml, next to gameday.sh). It pokes
# the LOAD-TEST stack's own automation at fixed minutes of the load and records
# what each Lambda answered; the watcher (combat-watch.py) records the effect.
#
#   minute REDIS_AT  (26) redis-autoscale {"action":"force"} one size up, under load
#                         (online resize through failover - the same call the
#                          Lambda makes by itself on 15 min of >= 70 % CPU)
#   minute SPOT_AT   (30) spot-fallback gets a SYNTHETIC EventBridge
#                         "SERVICE_TASK_PLACEMENT_FAILURE on FARGATE_SPOT" for the
#                         api service: AWS cannot be asked to run out of Spot, so
#                         we hand the Lambda the exact event AWS sends. It moves
#                         api to regular Fargate (rolling, under load); its own
#                         5-minute tick moves it back after restore_after_min (10).
#   minute DB_AT     (40) db-autoscale {"action":"force"} one size up (Multi-AZ:
#                         standby first, then a failover of about a minute)
#   minute FINAL_AT  (62) status of all three + the database night check
#                         (expected "not_night": the owner's rule is that the
#                          database shrinks only at night after 6 quiet hours)
# The Spot INTERRUPTION itself (SIGTERM, task stops) is the GameDay experiment
# api_stop_tasks (AWS FIS, gameday=ecs) at minute 24, run by gameday.sh.
#
#   combat-drill.sh <stack.json> <out-dir>
#   env: AWS_REGION, REDIS_AT SPOT_AT DB_AT FINAL_AT (minutes), DRY=1 (print only)
set -uo pipefail
stack="${1:?stack.json}"; out="${2:?out dir}"
mkdir -p "$out"; log="$out/combat-drills.jsonl"; : >"$log"
g() { jq -r ".$1 // empty" "$stack"; }
NAME="$(g name)"; CLUSTER="$(g cluster_name)"; API="$(g api_service_name)"
case "$NAME" in lawbid-loadtest*) ;; *) echo "[drill] REFUSING: stack name '$NAME' is not a load-test stack"; exit 5;; esac
r="${AWS_REGION:-us-east-1}"
t0="$(date +%s)"
wait_min() { local left=$(( t0 + $1 * 60 - $(date +%s) )); [ "$left" -gt 0 ] && sleep "$left"; return 0; }
now() { date -u +%FT%TZ; }

invoke() { # <what> <function suffix> <json payload>
  local fn="$NAME-$2" res="$out/drill-$1.json" body
  case "$fn" in lawbid-loadtest*) ;; *) echo "[drill] REFUSING function $fn"; return 5;; esac
  if [ "${DRY:-}" = 1 ]; then echo "[drill] DRY $fn $3"; body='{"dry":true}'
  else
    aws lambda invoke --region "$r" --function-name "$fn" --cli-binary-format raw-in-base64-out --payload "$3" "$res" >/dev/null 2>"$res.err" \
      && body="$(cat "$res")" || body="$(jq -Rs '{error: .}' <"$res.err")"
  fi
  jq -cn --arg at "$(now)" --arg what "$1" --arg fn "$fn" --argjson payload "$3" --argjson answer "${body:-null}" \
    '{at:$at, what:$what, function:$fn, payload:$payload, answer:$answer}' >>"$log" 2>/dev/null \
    || printf '{"at":"%s","what":"%s","function":"%s","answer_raw":%s}\n' "$(now)" "$1" "$fn" "$(printf '%s' "$body" | jq -Rs .)" >>"$log"
  echo "[drill] $(now) $1 -> $(printf '%s' "$body" | cut -c1-300)"
}

ceiling() { # the app's economy tick may have lowered the money ceiling of a throw-away stack
  [ "${DRY:-}" = 1 ] && return 0
  aws ssm put-parameter --region "$r" --name "/$NAME/$1/max-class" --value "$2" --type String --overwrite >/dev/null 2>&1 \
    && echo "[drill] ceiling /$NAME/$1/max-class = $2" || echo "[drill] could not set /$NAME/$1/max-class (the force may answer at_max)"
}

invoke start-db db-autoscale '{"action":"status"}'
invoke start-redis redis-autoscale '{"action":"status"}'
invoke start-spot spot-fallback '{"action":"status"}'

wait_min "${REDIS_AT:-26}"
ceiling redis-autoscale "${REDIS_TO:-cache.t4g.medium}"
invoke redis-grow redis-autoscale "{\"action\":\"force\",\"class\":\"${REDIS_TO:-cache.t4g.medium}\"}"

wait_min "${SPOT_AT:-30}"
if [ "${DRY:-}" = 1 ]; then svc_arn="arn:aws:ecs:$r:000000000000:service/$CLUSTER/$API"
else svc_arn="$(aws ecs describe-services --region "$r" --cluster "$CLUSTER" --services "$API" --query 'services[0].serviceArn' --output text 2>/dev/null)"; fi
acct="$(cut -d: -f5 <<<"$svc_arn")"
case "$svc_arn" in arn:aws:ecs:*:service/lawbid-loadtest*) ;; *) [ "${DRY:-}" = 1 ] || { echo "[drill] REFUSING: service arn '$svc_arn'"; exit 5; };; esac
event="$(jq -cn --arg svc "$svc_arn" --arg cp "arn:aws:ecs:$r:$acct:capacity-provider/FARGATE_SPOT" '{
  "detail-type": "ECS Service Action", source: "aws.ecs", resources: [$svc],
  detail: {eventType: "WARN", eventName: "SERVICE_TASK_PLACEMENT_FAILURE", capacityProviderArns: [$cp], reason: "RESOURCE:FARGATE", synthetic: "combat-drill row 59"}}')"
invoke spot-fallback spot-fallback "$event"

wait_min "${DB_AT:-40}"
ceiling db-autoscale "${DB_TO:-db.t4g.large}"
invoke db-grow db-autoscale "{\"action\":\"force\",\"class\":\"${DB_TO:-db.t4g.large}\"}"

wait_min "${FINAL_AT:-62}"
invoke end-spot spot-fallback '{"action":"status"}'
invoke end-redis redis-autoscale '{"action":"status"}'
invoke end-db db-autoscale '{"action":"status"}'
invoke end-db-night db-autoscale '{"mode":"night"}'
echo "[drill] done"
