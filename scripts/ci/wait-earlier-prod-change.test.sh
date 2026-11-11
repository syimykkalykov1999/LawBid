#!/usr/bin/env bash
# Offline tests for wait-earlier-prod-change.sh (no network).
set -euo pipefail
cd "$(dirname "$0")"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
echo '{"created_at":"2026-11-11T01:00:00Z"}' > "$T/me.json"
run() { WAIT_PROD_JSON_ME="$T/me.json" WAIT_PROD_JSON_RUNS="$T/runs.json" WAIT_PROD_TIMEOUT=0 WAIT_PROD_POLL=0 ./wait-earlier-prod-change.sh deploy.yml >/dev/null 2>&1; }
pass=0; fail=0
check() { if [ "$1" = "$2" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $3 (got $1, want $2)"; fi; }

echo '{"workflow_runs":[{"id":1,"status":"in_progress","created_at":"2026-11-11T00:30:00Z"}]}' > "$T/runs.json"
run && r=0 || r=1; check $r 1 "an earlier running deploy holds this run"

echo '{"workflow_runs":[{"id":2,"status":"in_progress","created_at":"2026-11-11T01:30:00Z"}]}' > "$T/runs.json"
run && r=0 || r=1; check $r 0 "a later deploy does not hold this run (no deadlock)"

echo '{"workflow_runs":[{"id":3,"status":"completed","created_at":"2026-11-11T00:30:00Z"}]}' > "$T/runs.json"
run && r=0 || r=1; check $r 0 "a finished earlier deploy does not hold this run"

echo '{"workflow_runs":[{"id":4,"status":"queued","created_at":"2026-11-11T00:59:59Z"}]}' > "$T/runs.json"
run && r=0 || r=1; check $r 1 "a queued earlier deploy holds this run"

echo "pass=$pass fail=$fail"; [ "$fail" = 0 ]
