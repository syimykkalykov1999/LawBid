#!/usr/bin/env bash
# One change to prod at a time (KNOWN_ERRORS 90, 91): a code deploy and an
# admin cloud change must not touch prod together (a cloud plan carries the
# images of its moment; applied during a deploy it rolls the API back).
#
#   wait-earlier-prod-change.sh deploy-rolling   (infra-apply.yml, before it
#       takes the job): wait while a deploy.yml run is in its «Deploy
#       production» job. A deploy still in its CI gate is not waited for
#       (2026-11-11: waiting for the whole pipeline timed the cloud change out).
#   wait-earlier-prod-change.sh infra-active     (deploy.yml, prod job): wait
#       while an infra-apply.yml run has passed its own wait step (it plans,
#       waits for the owner's code or applies).
#   wait-earlier-prod-change.sh rollback-active  (deploy.yml, prod job,
#       D1-38): wait while a rollback.yml «Roll production back» job runs.
#   wait-earlier-prod-change.sh deploy-past-wait (rollback.yml, D1-38): wait
#       while a deploy.yml «Deploy production» job is PAST its own
#       «Wait for an earlier rollback» step (it rolls prod now).
#   wait-earlier-prod-change.sh older-deploys-queued (deploy.yml «Deploy
#       order» job, deploy speed 25.11): the one-at-a-time rule of prod sits on
#       the «Deploy production» JOB now (job-level concurrency group `deploy`),
#       so CI gate + image build of a newer commit run while an older release
#       still rolls. GitHub keeps one pending job per group and CANCELS the
#       older pending one when a newer one arrives, so the jobs must arrive in
#       commit order: wait while an OLDER in-progress deploy.yml run (smaller
#       run id) has not finished its own «Deploy order» job, and for 45 s after
#       it did while its «Deploy production» job is not created yet.
# deploy-rolling also counts a running rollback (D1-38: a cloud plan made
# before a rollback would roll prod forward to the bad release again).
# Each pair waits one way only BEFORE and the other way only for a run PAST
# that point, so no two runs ever wait for each other (a rollback goes first).
#
# Env: GITHUB_REPOSITORY, GH_TOKEN (actions: read), WAIT_PROD_TIMEOUT
# (seconds, default 3000), WAIT_PROD_POLL (default 30); offline test mode:
# WAIT_PROD_JSON_RUNS (runs list) and WAIT_PROD_JSON_JOBS_DIR (<run id>.json).
set -euo pipefail
MODE="${1:?deploy-rolling | infra-active}"
TIMEOUT="${WAIT_PROD_TIMEOUT:-3000}"; POLL="${WAIT_PROD_POLL:-30}"
start=$(date +%s)

fetch() {
  local i out
  for i in 1 2 3 4 5; do
    if out=$(gh api "$@" 2>/dev/null); then printf '%s' "$out"; return 0; fi
    sleep 30
  done
  gh api "$@"
}
runs_of() {
  if [ -n "${WAIT_PROD_JSON_RUNS:-}" ]; then cat "$WAIT_PROD_JSON_RUNS"
  else fetch "repos/$GITHUB_REPOSITORY/actions/workflows/$1/runs?per_page=20"; fi
}
jobs_of() {
  if [ -n "${WAIT_PROD_JSON_JOBS_DIR:-}" ]; then cat "$WAIT_PROD_JSON_JOBS_DIR/$1.json"
  else fetch "repos/$GITHUB_REPOSITORY/actions/runs/$1/jobs"; fi
}

DEPLOY_ROLLING='[.jobs[] | select((.name|startswith("Deploy production")) and .status=="in_progress")] | length'
ROLLBACK_ROLLING='[.jobs[] | select((.name|startswith("Roll production back")) and .status=="in_progress")] | length'
INFRA_PAST='[.jobs[] | select(.status=="in_progress") | .steps[]? | select(.name=="Wait for an earlier code deploy" and .status=="completed")] | length'
DEPLOY_PAST='[.jobs[] | select((.name|startswith("Deploy production")) and .status=="in_progress") | .steps[]? | select(.name=="Wait for an earlier rollback" and .status=="completed")] | length'
# Deploy speed 25.11: an older run whose prod job may still join the queue.
# One line: CHECKS below is read line by line.
ORDER_BUSY='[.jobs[] | select(.name|startswith("Deploy order"))] as $o | [.jobs[] | select((.name|startswith("Deploy production")) and (.status=="in_progress" or .status=="completed" or .status=="waiting" or .status=="pending"))] as $p | if ($o|length) == 0 then 1 elif ($o[0].status != "completed") then 1 elif ($p|length) > 0 then 0 elif ((now - (($o[0].completed_at // "1970-01-01T00:00:00Z") | sub("\\.[0-9]+";"") | fromdateiso8601)) < 45) then 1 else 0 end'
# "<workflow file> <jq filter>" per line.
case "$MODE" in
  deploy-rolling) CHECKS="deploy.yml	$DEPLOY_ROLLING
rollback.yml	$ROLLBACK_ROLLING" ;;
  infra-active) CHECKS="infra-apply.yml	$INFRA_PAST" ;;
  rollback-active) CHECKS="rollback.yml	$ROLLBACK_ROLLING" ;;
  deploy-past-wait) CHECKS="deploy.yml	$DEPLOY_PAST" ;;
  older-deploys-queued) CHECKS="deploy.yml	$ORDER_BUSY" ;;
  *) echo "::error::unknown mode $MODE"; exit 2 ;;
esac

while :; do
  busy=""
  while IFS=$'\t' read -r OTHER BUSY; do
    [ -n "$OTHER" ] || continue
    # older-deploys-queued looks only at OLDER runs (run ids grow): no two
    # runs wait for each other.
    for id in $(runs_of "$OTHER" | jq -r --arg me "${GITHUB_RUN_ID:-0}" --arg older "$([ "$MODE" = older-deploys-queued ] && echo 1)" \
        '.workflow_runs[] | select(.status=="in_progress" and (.id|tostring)!=$me) | select($older != "1" or .id < ($me|tonumber)) | .id'); do
      n=$(jobs_of "$id" | jq "$BUSY")
      [ "$n" -gt 0 ] && busy="$busy $OTHER#$id"
    done
  done <<< "$CHECKS"
  if [ -z "$busy" ]; then echo "Nothing else is changing prod now ($MODE): go."; exit 0; fi
  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    echo "::error::still changing prod after ${TIMEOUT}s:$busy"; exit 1
  fi
  echo "Waiting for:$busy"
  sleep "$POLL"
done
