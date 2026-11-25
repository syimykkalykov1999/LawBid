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

# Deploy speed (25.11): phases. rolling_state <rolloutSeq json> [newRunning] [oldRunning]
rolling_state() {
  state ""
  jq --argjson seq "$1" --argjson nr "${2:-1}" --argjson or "${3:-0}" \
    '.svcs.api.rolloutSeq = $seq | .svcs.api.newRunning = $nr | .svcs.api.oldRunning = $or' \
    "$FAKE_AWS_STATE" > "$T/s.json" && mv "$T/s.json" "$FAKE_AWS_STATE"
}
phase() { (cd "$T" && env "$@" sh "$ROOT/scripts/deploy/roll-services.sh" lawbid-prod newtag api) > "$T/out.log" 2>&1; }

# 7. start: revisions + UpdateService only, state file written, no waiting.
rolling_state '["IN_PROGRESS"]'
phase ROLL_PHASE=start || die "start phase failed"
grep -q "^REVS=' api=$A/lawbid-prod-api:2 api-admin=$A/lawbid-prod-api:2'" "$T/roll-state-api.env" || die "state file lacks the revisions"
! grep -q 'rollout' "$T/out.log" || die "start phase waited"
[ "$(td_of api)" = "$A/lawbid-prod-api:2" ] || die "start did not update the api"
ok "ROLL_PHASE=start: updates the services and saves what the wait needs"

# 8. steady: returns while ECS still bakes (IN_PROGRESS), once all new tasks run and the old run none.
phase ROLL_PHASE=wait ROLL_UNTIL=steady || die "steady wait failed"
grep -q 'api: all new tasks running, old ones stopped' "$T/out.log" || die "steady not reported"
grep -q 'ECS still bakes' "$T/out.log" || die "steady did not return before COMPLETED"
ok "ROLL_UNTIL=steady: returns during the ECS bake"

# 9. steady is NOT reached while an old deployment still runs tasks (red on timeout).
rolling_state '["IN_PROGRESS"]' 1 2
phase ROLL_PHASE=start || die "start failed"
if phase ROLL_PHASE=wait ROLL_UNTIL=steady ROLL_TIMEOUT_SECONDS=1 ROLL_POLL_SECONDS=1; then die "steady while old tasks still run"; fi
grep -q 'rollout still IN_PROGRESS' "$T/out.log" || die "no timeout error"
ok "ROLL_UNTIL=steady waits while old tasks still serve"

# 10. wait (no ROLL_UNTIL) after steady: until COMPLETED of the same revisions.
rolling_state '["IN_PROGRESS","IN_PROGRESS","COMPLETED"]'
phase ROLL_PHASE=start || die "start failed"
phase ROLL_PHASE=wait ROLL_UNTIL=steady || die "steady failed"
phase ROLL_PHASE=wait || die "bake wait failed"
grep -q 'api: rollout COMPLETED' "$T/out.log" || die "bake wait did not wait for COMPLETED"
grep -q 'services (api) rolled out to newtag' "$T/out.log" || die "no final line"
ok "ROLL_PHASE=wait after steady: waits for COMPLETED"

# 11. the bake fails (ECS alarm rollback): wait is red, api-admin follows api back.
rolling_state '["IN_PROGRESS","FAILED"]'
phase ROLL_PHASE=start || die "start failed"
jq '.svcs.api.td = "'"$A"'/lawbid-prod-api:1"' "$FAKE_AWS_STATE" > "$T/s.json" && mv "$T/s.json" "$FAKE_AWS_STATE"
if phase ROLL_PHASE=wait; then die "a rolled-back bake went green"; fi
grep -q 'no longer deploying\|rollout FAILED' "$T/out.log" || die "no clear error"
[ "$(td_of api-admin)" = "$A/lawbid-prod-api:1" ] || die "api-admin stayed on the rejected release"
ok "ROLL_PHASE=wait: an ECS rollback during the bake is red, api-admin goes back"

# 12. wait without a start / for another tag: red at once.
rm -f "$T/roll-state-api.env"
if phase ROLL_PHASE=wait; then die "wait without start went green"; fi
grep -q 'run ROLL_PHASE=start' "$T/out.log" || die "no clear error without state"
rolling_state '["COMPLETED"]'
phase ROLL_PHASE=start || die "start failed"
if (cd "$T" && ROLL_PHASE=wait sh "$ROOT/scripts/deploy/roll-services.sh" lawbid-prod othertag api) > "$T/out.log" 2>&1; then die "wait for another tag went green"; fi
ok "ROLL_PHASE=wait needs the start of the same tag"

# 13. default (all) is unchanged: one call, COMPLETED, no state file.
rm -f "$T/roll-state-api.env"
rolling_state '["COMPLETED"]'
roll || die "default roll failed"
grep -q 'api: rollout COMPLETED' "$T/out.log" || die "default did not wait for COMPLETED"
[ ! -e "$T/roll-state-api.env" ] || die "default wrote a state file"
ok "ROLL_PHASE=all (default): unchanged"

echo "roll-services: $PASS passed"
