#!/usr/bin/env bash
# GameDay driver (docs/runbooks/GAMEDAY.md): runs on the GitHub runner while the
# load is running (started in the background by .github/workflows/load-test.yml).
# Starts the AWS FIS experiments of the LOAD-TEST stack one after another,
# probes /health/live every 2 s through the ALB to measure how long the API was
# unreachable, and writes $OUT/gameday.json for loadtest/scripts/report.mjs.
#
#   gameday.sh <selection> <templates.json> <out-dir>
#     selection      ecs | rds | redis | all   (what to break; "none" = do nothing)
#     templates.json terraform output -json gameday_templates
#   env: ALB (dns name), HOST_HEADER, DELAY_SECONDS (wait after start, default 600),
#        GAP_SECONDS (calm time between two experiments, default 300),
#        EXPERIMENT_TIMEOUT (default 900), AWS_REGION
#
# Never prod: refuses unless ALB looks like a load-test stack and the template ids
# come from the load-test state. FIS itself stops an experiment when one of the
# stop-condition alarms (infra/modules/fis-gameday) fires.
set -uo pipefail
sel="${1:?selection}"; tpl="${2:?templates.json}"; out="${3:?out dir}"
[ "$sel" = none ] && { echo "[gameday] nothing selected"; exit 0; }
: "${ALB:?}" "${HOST_HEADER:?}"
case "$HOST_HEADER" in *loadtest*) ;; *) echo "[gameday] REFUSING: host $HOST_HEADER is not a load-test host"; exit 5;; esac
delay="${DELAY_SECONDS:-600}"; gap="${GAP_SECONDS:-300}"; tmo="${EXPERIMENT_TIMEOUT:-900}"
mkdir -p "$out"; res="$out/gameday.json"; probe="$out/gameday-probe.log"; : >"$probe"
echo '{"experiments":[]}' >"$res"

case "$sel" in
  ecs)   list="api_stop_tasks";;
  rds)   list="rds_failover";;
  redis) list="redis_failover";;
  all)   list="api_stop_tasks redis_failover rds_failover";;
  *) echo "[gameday] unknown selection $sel"; exit 2;;
esac

up() { [ "$(curl -ks -o /dev/null -m 3 -w '%{http_code}' -H "Host: $HOST_HEADER" "https://$ALB/health/live" || true)" = 200 ]; }
now() { date -u +%FT%TZ; }
sec() { date +%s; }

echo "[gameday] waiting ${delay}s for the load to reach its plateau"
sleep "$delay"

for key in $list; do
  id="$(jq -r --arg k "$key" '.[$k] // empty' "$tpl")"
  [ -z "$id" ] && { echo "[gameday] no template for $key, skipped"; continue; }
  # calm before the storm: API healthy 5 probes in a row
  ok=0; for _ in $(seq 1 60); do if up; then ok=$((ok+1)); else ok=0; fi; [ "$ok" -ge 5 ] && break; sleep 2; done
  t0="$(now)"; s0="$(sec)"
  echo "[gameday] $key: start experiment from template $id at $t0"
  exp="$(aws fis start-experiment --experiment-template-id "$id" --tags Project=lawbid-loadtest --query 'experiment.id' --output text 2>&1)" || { echo "[gameday] start failed: $exp"; jq --arg k "$key" --arg e "$exp" --arg t "$t0" '.experiments += [{name:$k,status:"start_failed",reason:$e,started:$t}]' "$res" >"$res.t" && mv "$res.t" "$res"; continue; }
  # probe loop: longest run of failed probes while the experiment runs
  fail_run=0; fail_max=0; fails=0; probes=0; status=running; reason=""
  while :; do
    if up; then fail_run=0; else fail_run=$((fail_run+2)); fails=$((fails+1)); [ "$fail_run" -gt "$fail_max" ] && fail_max="$fail_run"; fi
    probes=$((probes+1))
    if [ $((probes % 5)) = 0 ]; then
      j="$(aws fis get-experiment --id "$exp" --output json 2>/dev/null || echo '{}')"
      status="$(jq -r '.experiment.state.status // "running"' <<<"$j")"; reason="$(jq -r '.experiment.state.reason // ""' <<<"$j")"
      case "$status" in completed|stopped|failed|cancelled) break;; esac
    fi
    [ $(( $(sec) - s0 )) -gt "$tmo" ] && { aws fis stop-experiment --id "$exp" >/dev/null 2>&1; status=timeout; reason="runner timeout ${tmo}s, stop requested"; break; }
    sleep 2
  done
  # after the experiment: how long until the API is steady again (max 5 min)
  rec_s="$(sec)"; ok=0
  for _ in $(seq 1 150); do
    if up; then ok=$((ok+1)); [ "$ok" -ge 5 ] && break; else ok=0; fail_run=$((fail_run+2)); [ "$fail_run" -gt "$fail_max" ] && fail_max="$fail_run"; fi
    sleep 2
  done
  recovered=$([ "$ok" -ge 5 ] && echo true || echo false)
  t1="$(now)"
  echo "$key $exp status=$status reason=$reason probes=$probes failed_probes=$fails longest_gap_s=$fail_max recovered=$recovered" | tee -a "$probe"
  jq --arg k "$key" --arg e "$exp" --arg s "$status" --arg r "$reason" --arg a "$t0" --arg b "$t1" \
     --argjson p "$probes" --argjson f "$fails" --argjson g "$fail_max" --argjson rec "$recovered" --argjson rs "$(( $(sec) - rec_s ))" \
     '.experiments += [{name:$k,experiment_id:$e,status:$s,reason:$r,started:$a,ended:$b,probes:$p,failed_probes:$f,longest_unreachable_s:$g,recovered:$rec,recovery_wait_s:$rs}]' "$res" >"$res.t" && mv "$res.t" "$res"
  [ "$status" = stopped ] && { echo "[gameday] a stop condition fired: no more experiments"; break; }
  sleep "$gap"
done
echo "[gameday] done"
