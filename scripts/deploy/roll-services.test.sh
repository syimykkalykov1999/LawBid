#!/usr/bin/env bash
# X1 (25.11): scripts/deploy/roll-services.sh and canary.sh with the ECS built-in
# canary / linear deployment, on the fake `aws` of scripts/infra/testdata/fake-aws.mjs.
#   bash scripts/deploy/roll-services.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/roll-services.XXXXXX")"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
printf '#!/bin/sh\nexec node "%s/scripts/infra/testdata/fake-aws.mjs" "$@"\n' "$ROOT" > "$T/bin/aws"
chmod +x "$T/bin/aws"
export PATH="$T/bin:$PATH" FAKE_AWS_STATE="$T/state.json" FAKE_AWS_LOG="$T/calls.log" \
  ROLL_POLL_SECONDS=0 ROLL_TIMEOUT_SECONDS=5 ECR_REGISTRY=123.dkr.ecr.us-east-1.amazonaws.com
PASS=0
ok() { PASS=$((PASS + 1)); echo "ok - $1"; }
die() { echo "not ok - $1"; echo "--- output:"; cat "$T/out.log" 2>/dev/null || true; echo "--- calls:"; cat "$T/calls.log" 2>/dev/null || true; exit 1; }
A=arn:aws:ecs:us-east-1:1:task-definition

# state <api strategy or ""> [nativeSeq json array]
state() {
  jq -n --arg A "$A" --arg s "$1" --argjson seq "${2:-null}" '{
    tds: {("\($A)/lawbid-prod-api:1"): {family: "lawbid-prod-api", containerDefinitions: [{name: "api", image: "x/lawbid-api:old", environment: []}]}},
    svcs: {api: ({td: "\($A)/lawbid-prod-api:1", status: "ACTIVE"} + (if $s == "" then {} else {strategy: $s} end) + (if $seq == null then {} else {nativeSeq: $seq} end)),
           "api-admin": {td: "\($A)/lawbid-prod-api:1", status: "ACTIVE"}}}' > "$FAKE_AWS_STATE"
  : > "$FAKE_AWS_LOG"
}
roll() { (cd "$T" && sh "$ROOT/scripts/deploy/roll-services.sh" lawbid-prod newtag api) > "$T/out.log" 2>&1; }
td_of() { jq -r --arg s "$1" '.svcs[$s].td' "$FAKE_AWS_STATE"; }

# 1. CANARY: the script waits for ECS's service deployment and passes on SUCCESSFUL.
state CANARY
roll || die "canary roll failed"
grep -q 'ECS deployment sd/1' "$T/out.log" || die "did not find the ECS service deployment of our revision"
grep -q 'IN_PROGRESS	PRODUCTION_TRAFFIC_SHIFT' "$T/out.log" || die "did not report the lifecycle stage"
grep -q 'ECS deployment SUCCESSFUL' "$T/out.log" || die "did not wait for SUCCESSFUL"
[ "$(td_of api)" = "$A/lawbid-prod-api:2" ] || die "api is not on the new revision"
[ "$(td_of api-admin)" = "$A/lawbid-prod-api:2" ] || die "api-admin did not follow api"
ok "CANARY: waits for the ECS deployment until SUCCESSFUL, api-admin follows"

# 2. CANARY rolled back by ECS (alarm / circuit breaker): red, api-admin back on api's revision.
state CANARY '["IN_PROGRESS\tPRODUCTION_TRAFFIC_SHIFT\tNone","ROLLBACK_IN_PROGRESS\tPRODUCTION_TRAFFIC_SHIFT\talarm","ROLLBACK_SUCCESSFUL\tCLEAN_UP\talarm api-5xx-ratio"]'
if roll; then die "a rolled-back canary went green"; fi
grep -q 'ECS rejected the release' "$T/out.log" || die "no clear error"
[ "$(td_of api)" = "$A/lawbid-prod-api:1" ] || die "fake: api should be back on :1"
[ "$(td_of api-admin)" = "$A/lawbid-prod-api:1" ] || die "api-admin stayed on the rejected release"
ok "CANARY rolled back by ECS: the job is red and api-admin goes back"

# 3. LINEAR is waited for the same way.
state LINEAR
roll || die "linear roll failed"
grep -q 'ECS deployment SUCCESSFUL' "$T/out.log" || die "linear not waited for"
ok "LINEAR: waits for the ECS deployment"

# 4. ROLLING (today, strategy unknown/None): the old rolloutState wait, no service-deployment lookups.
state ""
roll || die "rolling roll failed"
! grep -q 'ECS deployment' "$T/out.log" || die "rolling used the native wait"
grep -q 'api: rollout COMPLETED' "$T/out.log" || die "rolling did not use the rolloutState wait"
ok "ROLLING: unchanged rolloutState wait"

# 5. Timeout: ECS never finishes -> red after ROLL_TIMEOUT_SECONDS.
state CANARY '["IN_PROGRESS\tPRODUCTION_TRAFFIC_SHIFT\tNone"]'
if ROLL_TIMEOUT_SECONDS=1 ROLL_POLL_SECONDS=1 roll; then die "an endless deployment went green"; fi
grep -q 'still IN_PROGRESS' "$T/out.log" || die "no timeout error"
ok "CANARY that never ends: red on timeout"

# 6. canary.sh steps aside when ECS runs its own canary (no api-canary service).
state CANARY
(cd "$T" && CANARY_ENABLED=true sh "$ROOT/scripts/deploy/canary.sh" lawbid-prod newtag) > "$T/out.log" 2>&1 || die "canary.sh failed"
grep -q 'ECS built-in CANARY deployment' "$T/out.log" || die "canary.sh did not step aside"
[ ! -s "$T/calls.log" ] || die "canary.sh changed something"
ok "canary.sh does nothing when the api uses the ECS built-in canary"

echo "roll-services: $PASS passed"
