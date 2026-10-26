#!/usr/bin/env bash
# S11-1: a release is built only from a commit whose CI is green (Google SRE
# book, release engineering). Used by deploy.yml, web-deploy.yml and
# mobile-release.yml as the first job.
#
#   require-green.sh <sha> <must-have-regex> [exclude-regex]
#
# Reads the check runs of the commit (gh api commits/<sha>/check-runs) and
#   * waits while any check that is not ours is queued / in progress,
#   * fails when any of them ended failure / cancelled / timed_out /
#     action_required / stale,
#   * fails when NO check matching <must-have-regex> exists (an untested
#     commit must not pass because nothing ran).
# Skipped / neutral checks count as passed (path filters leave some out).
# Env: GITHUB_REPOSITORY, GH_TOKEN (checks: read), REQUIRE_GREEN_TIMEOUT
# (seconds, default 2700), REQUIRE_GREEN_POLL (default 30),
# REQUIRE_GREEN_JSON (a file with check runs: offline test mode).
set -euo pipefail
SHA="${1:?sha}"; MUST="${2:?must-have regex}"; EXCLUDE="${3:-^$}"
TIMEOUT="${REQUIRE_GREEN_TIMEOUT:-2700}"; POLL="${REQUIRE_GREEN_POLL:-30}"
start=$(date +%s)

fetch() {
  if [ -n "${REQUIRE_GREEN_JSON:-}" ]; then cat "$REQUIRE_GREEN_JSON"; return; fi
  gh api --paginate "repos/${GITHUB_REPOSITORY:?}/commits/${SHA}/check-runs?per_page=100" \
    | jq -s '[.[].check_runs[]]'
}

# Prints "green", "wait: ..." or "red: ...".
judge() {
  jq -r --arg must "$MUST" --arg ex "$EXCLUDE" '
    # newest run per check name (a re-run replaces the old result)
    (map(select(.name | test($ex) | not))
      | group_by(.name) | map(sort_by(.started_at // .completed_at // "") | last)) as $runs
    | ($runs | map(select(.status != "completed") | .name)) as $open
    | ($runs | map(select(.status == "completed"
          and (.conclusion | IN("success","skipped","neutral") | not)) | "\(.name)=\(.conclusion)")) as $bad
    | ($runs | map(select(.name | test($must))) | length) as $have
    | if ($bad | length) > 0 then "red: " + ($bad | join(", "))
      elif $have == 0 and ($open | length) == 0 then "red: no check matching /" + $must + "/ ran for this commit"
      elif ($open | length) > 0 or $have == 0 then "wait: " + (($open | join(", ")) // "")
      else "green" end' 
}

while :; do
  R=$(fetch | judge)
  case "$R" in
    green) echo "CI is green for $SHA"; exit 0 ;;
    red:*) echo "::error::CI is not green for $SHA — ${R#red: }"; exit 1 ;;
  esac
  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    echo "::error::CI did not finish for $SHA within ${TIMEOUT}s (${R#wait: })"; exit 1
  fi
  echo "waiting for CI on $SHA: ${R#wait: }"
  sleep "$POLL"
done
