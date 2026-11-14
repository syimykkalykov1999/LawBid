#!/usr/bin/env bash
# ONE COMMAND for the combat test (owner row 59, docs/dev/AWS_COMBAT_TEST_PLAN_2026-11-13.md).
#
#   loadtest/combat/run.sh            free local preflight only (nothing in AWS)
#   loadtest/combat/run.sh --start    preflight, then starts GitHub "Load test"
#                                     profile=combat confirm_cost=$COST (40) gameday=ecs
#
# --start creates NOTHING by itself: GitHub first prints the cost table, then the
# `run` job waits for the owner's "Review deployments -> Approve" (environment
# load-test). Everything after that is the existing pipeline: create -> seed ->
# load + drills + watcher -> report -> DESTROY (always) -> proof nothing is left.
# Test accounts: only the throw-away stack's own seeded people (box/seed.sh,
# scripts/mint.mjs tokens signed with the stack's own random JWT key) - never real users.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
cd "$root"
COST="${COST:-40}"
start=0; [ "${1:-}" = --start ] && start=1

echo "== 1. profiles, tfvars and caps agree"
node loadtest/scripts/check-profiles.mjs
echo "== 2. cost estimate of profile combat (the run refuses to start above \$$COST)"
node loadtest/scripts/estimate-cost.mjs combat
upper="$(node loadtest/scripts/estimate-cost.mjs combat --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["upper_bound_usd"])')"
python3 -c "import sys; u=float('$upper')*1.3; sys.exit(0 if u <= float('$COST') else 1)" \
  || { echo "REFUSING: upper bound x1.3 (gameday) above \$$COST"; exit 1; }
echo "== 3. shell syntax of every script the run uses"
for f in loadtest/scripts/*.sh loadtest/scripts/box/*.sh loadtest/combat/*.sh; do bash -n "$f"; done
echo "== 4. unit tests of the guards (cost guard, combat watcher)"
python3 -m unittest discover -s loadtest/scripts/tests 2>&1 | tail -n 3
echo "== 5. k6 parses the combat scenarios (k6 inspect, no load)"
if command -v k6 >/dev/null; then K6=(k6); else K6=(docker run --rm -i -v "$root/loadtest:/loadtest:ro" -w / grafana/k6); fi
if [ "${K6[0]}" = k6 ]; then src=loadtest/k6/main.js; else src=/loadtest/k6/main.js; fi
"${K6[@]}" inspect -e PROFILE=combat -e SHARDS=2 "$src" \
  | python3 -c 'import json,sys; o=json.load(sys.stdin); print({k: v["executor"] for k, v in o["scenarios"].items()}, "abort:", o["thresholds"]["http_req_failed"][0]["threshold"])'
echo "== 6. drills refuse anything that is not the load-test stack"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/combat.XXXXXX")"; echo '{"name":"lawbid-prod"}' >"$tmp/s.json"
if bash loadtest/scripts/combat-drill.sh "$tmp/s.json" "$tmp/o" >/dev/null 2>&1; then echo "drill did NOT refuse prod"; exit 1; else echo "drill refuses a prod stack: ok"; fi
rm -rf "$tmp"
echo "preflight OK"

[ "$start" = 1 ] || { echo "(preflight only; add --start to ask GitHub for the run)"; exit 0; }
command -v gh >/dev/null || { echo "gh is required"; exit 2; }
git fetch -q origin main
git show origin/main:loadtest/profiles.json | grep -q '"combat"' \
  || { echo "REFUSING: the combat profile is not on origin/main yet (the workflow runs from main): merge the PR first"; exit 1; }
gh workflow run load-test.yml --ref main -f profile=combat -f confirm_cost="$COST" -f gameday=ecs
sleep 5
gh run list --workflow load-test.yml --limit 1 --json url,displayTitle --jq '.[0] | "\(.displayTitle): \(.url)"'
echo "Next: open the link, check the cost table, then Review deployments -> load-test -> Approve and deploy."
