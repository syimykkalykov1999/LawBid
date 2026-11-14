#!/usr/bin/env bash
# Cleanup / proof after a combat run (owner row 59). The workflow itself always
# destroys the stack (terraform destroy x3, then sweep by tag) and the hourly
# load-test-watchdog.yml removes anything older than 4 h; this is the manual
# check and the last resort.
#
#   loadtest/combat/teardown.sh                  read-only: lists what is left
#   loadtest/combat/teardown.sh --sweep <RunId>  deletes what is left of THAT run,
#                                                 only resources tagged
#                                                 Project=lawbid-loadtest + RunId
#   loadtest/combat/teardown.sh --prod-check     read-only: prod api scaling
#                                                 activities of the last 3 h
#                                                 (the shared OpenSockets metric)
# Needs AWS credentials that can read tags (and delete, for --sweep). Never
# touches anything tagged Project=lawbid (sweep.sh filters by the load-test tag).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scripts="$here/../scripts"
r="${AWS_REGION:-us-east-1}"
case "${1:-}" in
  --sweep)
    run="${2:?--sweep needs the RunId (GitHub run id-attempt, e.g. 41512197418-1)}"
    case "$run" in *[!0-9-]*|"") echo "REFUSING: RunId '$run' must look like 123456-1"; exit 2;; esac
    echo "deleting what is left of load-test run $run (tag Project=lawbid-loadtest, RunId=$run)"
    "$scripts/sweep.sh" "$run"
    WAIT=600 "$scripts/verify-clean.sh";;
  --prod-check)
    since="$(date -u -v-3H +%FT%TZ 2>/dev/null || date -u -d '3 hours ago' +%FT%TZ)"
    aws application-autoscaling describe-scaling-activities --region "$r" --service-namespace ecs \
      --resource-id "service/${PROD_CLUSTER:-lawbid-prod}/${PROD_API_SERVICE:-api}" --max-results 20 \
      --query "ScalingActivities[?StartTime>=\`$since\`].[StartTime,StatusCode,Description]" --output table;;
  "")
    WAIT=0 "$scripts/verify-clean.sh" && echo "nothing tagged lawbid-loadtest is left";;
  *) echo "usage: teardown.sh [--sweep <RunId> | --prod-check]"; exit 2;;
esac
