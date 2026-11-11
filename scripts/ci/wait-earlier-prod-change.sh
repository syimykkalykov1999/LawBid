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
# The cloud change waits only BEFORE it plans and the deploy waits only for a
# cloud change that is PAST that point, so the two never wait for each other.
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

case "$MODE" in
  deploy-rolling) OTHER=deploy.yml
    BUSY='[.jobs[] | select((.name|startswith("Deploy production")) and .status=="in_progress")] | length' ;;
  infra-active) OTHER=infra-apply.yml
    BUSY='[.jobs[] | select(.status=="in_progress") | .steps[]? | select(.name=="Wait for an earlier code deploy" and .status=="completed")] | length' ;;
  *) echo "::error::unknown mode $MODE"; exit 2 ;;
esac

while :; do
  busy=""
  for id in $(runs_of "$OTHER" | jq -r --arg me "${GITHUB_RUN_ID:-0}" \
      '.workflow_runs[] | select(.status=="in_progress" and (.id|tostring)!=$me) | .id'); do
    n=$(jobs_of "$id" | jq "$BUSY")
    [ "$n" -gt 0 ] && busy="$busy $id"
  done
  if [ -z "$busy" ]; then echo "No $OTHER run is changing prod now: go."; exit 0; fi
  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    echo "::error::$OTHER still changing prod after ${TIMEOUT}s:$busy"; exit 1
  fi
  echo "Waiting for $OTHER:$busy"
  sleep "$POLL"
done
