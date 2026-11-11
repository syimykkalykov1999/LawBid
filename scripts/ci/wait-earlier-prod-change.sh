#!/usr/bin/env bash
# 2026-11-10 (prod, KNOWN_ERRORS 90): a code deploy and an admin cloud change
# ran at the same time; the cloud apply replaced the API task definition the
# deploy was rolling (older image, pooler that was not up), ECS rolled back
# and the deploy failed. One change to prod at a time: whoever started first
# goes first. This run waits while a run of the OTHER workflow that was
# created earlier is still queued or running; later runs wait for this one,
# so two waiting runs never block each other.
#
#   wait-earlier-prod-change.sh <other-workflow-file>   (deploy.yml | infra-apply.yml)
#
# Env: GITHUB_REPOSITORY, GITHUB_RUN_ID, GH_TOKEN (actions: read),
# WAIT_PROD_TIMEOUT (seconds, default 2400), WAIT_PROD_POLL (default 30),
# WAIT_PROD_JSON_ME / WAIT_PROD_JSON_RUNS (files: offline test mode).
set -euo pipefail
OTHER="${1:?other workflow file}"
TIMEOUT="${WAIT_PROD_TIMEOUT:-2400}"; POLL="${WAIT_PROD_POLL:-30}"
start=$(date +%s)

fetch() {
  local i
  for i in 1 2 3 4 5; do
    if out=$(gh api "$@" 2>/dev/null); then printf '%s' "$out"; return 0; fi
    sleep 30
  done
  gh api "$@"
}

if [ -n "${WAIT_PROD_JSON_ME:-}" ]; then
  me=$(jq -r .created_at "$WAIT_PROD_JSON_ME")
else
  me=$(fetch "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" | jq -r .created_at)
fi

while :; do
  if [ -n "${WAIT_PROD_JSON_RUNS:-}" ]; then
    runs=$(cat "$WAIT_PROD_JSON_RUNS")
  else
    runs=$(fetch "repos/$GITHUB_REPOSITORY/actions/workflows/$OTHER/runs?per_page=20")
  fi
  ahead=$(jq -r --arg me "$me" '[.workflow_runs[]
    | select(.status != "completed" and .created_at < $me)
    | "\(.id) \(.status) \(.created_at)"] | .[]' <<<"$runs")
  if [ -z "$ahead" ]; then
    echo "No earlier $OTHER run in progress: go."
    exit 0
  fi
  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    echo "::error::an earlier $OTHER run is still going after ${TIMEOUT}s: $ahead"
    exit 1
  fi
  echo "Waiting for the earlier $OTHER run(s): $ahead"
  sleep "$POLL"
done
