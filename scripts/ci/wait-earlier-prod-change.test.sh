#!/usr/bin/env bash
# Offline tests for wait-earlier-prod-change.sh (no network).
set -euo pipefail
cd "$(dirname "$0")"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
check() { if [ "$1" = "$2" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $3 (got $1, want $2)"; fi; }
run() { WAIT_PROD_JSON_RUNS="$T/runs.json" WAIT_PROD_JSON_JOBS_DIR="$T" WAIT_PROD_TIMEOUT=0 WAIT_PROD_POLL=0 ./wait-earlier-prod-change.sh "$1" >/dev/null 2>&1 && echo 0 || echo 1; }
echo '{"workflow_runs":[{"id":7,"status":"in_progress"}]}' > "$T/runs.json"

echo '{"jobs":[{"name":"Wait for green CI","status":"in_progress"},{"name":"Deploy production (manual approval)","status":"queued"}]}' > "$T/7.json"
check "$(run deploy-rolling)" 0 "a deploy still in its CI gate does not hold the cloud change"
echo '{"jobs":[{"name":"Deploy production (manual approval)","status":"in_progress"}]}' > "$T/7.json"
check "$(run deploy-rolling)" 1 "a deploy rolling prod holds the cloud change"

echo '{"jobs":[{"name":"apply","status":"in_progress","steps":[{"name":"Wait for an earlier code deploy","status":"in_progress"}]}]}' > "$T/7.json"
check "$(run infra-active)" 0 "a cloud change still waiting does not hold the deploy (no deadlock)"
echo '{"jobs":[{"name":"apply","status":"in_progress","steps":[{"name":"Wait for an earlier code deploy","status":"completed"},{"name":"Plan","status":"in_progress"}]}]}' > "$T/7.json"
check "$(run infra-active)" 1 "a cloud change that plans or applies holds the deploy"

# D1-38: rollback is serialized with deploy and cloud changes.
echo '{"jobs":[{"name":"Roll production back (abc1234)","status":"in_progress"}]}' > "$T/7.json"
check "$(run deploy-rolling)" 1 "a running rollback holds the cloud change"
check "$(run rollback-active)" 1 "a running rollback holds the deploy"
echo '{"jobs":[{"name":"Deploy production (manual approval)","status":"in_progress","steps":[{"name":"Wait for an earlier rollback","status":"in_progress"}]}]}' > "$T/7.json"
check "$(run deploy-past-wait)" 0 "a deploy still waiting does not hold the rollback (no deadlock)"
check "$(run rollback-active)" 0 "a deploy job is not a rollback"
echo '{"jobs":[{"name":"Deploy production (manual approval)","status":"in_progress","steps":[{"name":"Wait for an earlier rollback","status":"completed"},{"name":"Rolling deploy api","status":"in_progress"}]}]}' > "$T/7.json"
check "$(run deploy-past-wait)" 1 "a deploy rolling prod holds the rollback"

echo '{"workflow_runs":[{"id":7,"status":"completed"}]}' > "$T/runs.json"
check "$(run infra-active)" 0 "finished runs hold nothing"

echo "pass=$pass fail=$fail"; [ "$fail" = 0 ]
