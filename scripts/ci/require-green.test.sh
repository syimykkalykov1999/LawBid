#!/usr/bin/env bash
# Offline test of require-green.sh (fixtures from `gh api .../check-runs`).
set -u
D="$(cd "$(dirname "$0")" && pwd)"; fail=0
run() { # name expected-exit must json
  REQUIRE_GREEN_JSON="$D/fixtures/require-green/$4" REQUIRE_GREEN_TIMEOUT=0 REQUIRE_GREEN_POLL=0 \
    "$D/require-green.sh" abc "$3" '^(Gate|Build)' >/dev/null 2>&1
  got=$?; if [ "$got" != "$2" ]; then echo "FAIL $1: exit $got, want $2"; fail=1; else echo "ok   $1"; fi
}
run "all green" 0 '^API' green.json
run "one red" 1 '^API' red.json
run "cancelled counts as red" 1 '^API' cancelled.json
run "still running -> timeout" 1 '^API' pending.json
run "nothing matching ran" 1 '^Mobile' green.json
run "re-run replaced the failure" 0 '^API' rerun.json
exit $fail
