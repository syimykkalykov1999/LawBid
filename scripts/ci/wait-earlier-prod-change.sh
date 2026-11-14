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
# "<workflow file> <jq filter>" per line.
case "$MODE" in
  deploy-rolling) CHECKS="deploy.yml	$DEPLOY_ROLLING
rollback.yml	$ROLLBACK_ROLLING" ;;
  infra-active) CHECKS="infra-apply.yml	$INFRA_PAST" ;;
  rollback-active) CHECKS="rollback.yml	$ROLLBACK_ROLLING" ;;
  deploy-past-wait) CHECKS="deploy.yml	$DEPLOY_PAST" ;;
  *) echo "::error::unknown mode $MODE"; exit 2 ;;
esac

while :; do
  busy=""
  while IFS=$'\t' read -r OTHER BUSY; do
    [ -n "$OTHER" ] || continue
    for id in $(runs_of "$OTHER" | jq -r --arg me "${GITHUB_RUN_ID:-0}" \
        '.workflow_runs[] | select(.status=="in_progress" and (.id|tostring)!=$me) | .id'); do
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
