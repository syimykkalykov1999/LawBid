#!/usr/bin/env bash
# ON a generator box: runs k6 for this box's slice of the profile and uploads
# the results folder. Exit code = run-generator.sh's (0 ok, 3 aborted by the
# guard, 4 targets missed, 5 refused).
#   env: RUN_ID ARTIFACTS_BUCKET PROFILE SHARD SHARDS API_URL WS_URL HOST_HEADER CDN_URL
set -uo pipefail
source "$(dirname "$0")/common.sh"
: "${PROFILE:?}" "${SHARD:?}" "${SHARDS:?}" "${API_URL:?}" "${WS_URL:?}"
w=/tmp/lt-run; rm -rf "$w"; mkdir -p "$w"
aws s3 cp "$S3/tokens.json" "$w/tokens.json" --only-show-errors
aws s3 cp "$S3/fixtures.json" "$w/fixtures.json" --only-show-errors
export OUT="$w/out" TOKENS_FILE="$w/tokens.json" FIXTURES_FILE="$w/fixtures.json"
ulimit -n 1000000 2>/dev/null || true
"$LT/loadtest/scripts/run-generator.sh"
rc=$?
aws s3 cp "$OUT" "$S3/results/$PROFILE-$SHARD/" --recursive --only-show-errors || true
exit $rc
