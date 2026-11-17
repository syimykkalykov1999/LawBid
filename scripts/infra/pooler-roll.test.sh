#!/usr/bin/env bash
# KNOWN_ERRORS 182: pooler-roll.sh (drain before the pooler goes, align after
# every apply) together with the REAL scripts/deploy/roll-services.sh, on a
# fake `aws` (scripts/infra/testdata/fake-aws.mjs). Run: bash scripts/infra/pooler-roll.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/pooler-roll.XXXXXX")";trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
printf '#!/bin/sh\nexec node "%s/scripts/infra/testdata/fake-aws.mjs" "$@"\n' "$ROOT" > "$T/bin/aws"
chmod +x "$T/bin/aws"
export PATH="$T/bin:$PATH" FAKE_AWS_STATE="$T/state.json" FAKE_AWS_LOG="$T/calls.log" ROLL_POLL_SECONDS=0 ROLL_TIMEOUT_SECONDS=5
PASS=0
ok() { PASS=$((PASS + 1)); echo "ok - $1"; }
die() { echo "not ok - $1"; echo "--- calls:"; cat "$T/calls.log" 2>/dev/null || true; exit 1; }
A=arn:aws:ecs:us-east-1:1:task-definition
IMG=123.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:abc123

# td <family> <container> <extra env json array>
td() {
  jq -n --arg f "$1" --arg c "$2" --arg img "$IMG" --argjson env "$3" '{family:$f, containerDefinitions:[
    {name:$c, image:$img, environment:([{name:"FOO",value:"bar"},{name:"APP_VERSION",value:"abc123"}] + $env)},
    {name:"clamav", image:"x/lawbid-clamav:1.4-debian", environment:[]}]}'
}
POOLER='[{"name":"DB_POOLER_HOST","value":"pgbouncer.lawbid-prod.internal"},{"name":"DB_POOLER_PORT","value":"5432"},{"name":"DB_POOL_SIZE","value":"10"}]'
DIRECT='[{"name":"DB_POOL_SIZE","value":"5"}]'
# state <api:1 env> <api:2 env> <worker:1 env> <worker:2 env> <pgbouncer running>
state() {
  jq -n --arg A "$A" --argjson a1 "$(td lawbid-prod-api api "$1")" --argjson a2 "$(td lawbid-prod-api api "$2" | jq '.containerDefinitions[0].environment += [{name:"LATEST",value:"1"}]')" \
    --argjson w1 "$(td lawbid-prod-worker worker "$3")" --argjson w2 "$(td lawbid-prod-worker worker "$4")" --argjson n "$5" '{
    tds: {("\($A)/lawbid-prod-api:1"): $a1, ("\($A)/lawbid-prod-api:2"): $a2,
          ("\($A)/lawbid-prod-worker:1"): $w1, ("\($A)/lawbid-prod-worker:2"): $w2},
    svcs: {api: {td: "\($A)/lawbid-prod-api:1", status: "ACTIVE"}, "api-admin": {td: "\($A)/lawbid-prod-api:1", status: "ACTIVE"},
           worker: {td: "\($A)/lawbid-prod-worker:1", status: "ACTIVE"},
           pgbouncer: {td: "\($A)/lawbid-prod-pgbouncer:1", status: (if $n > 0 then "ACTIVE" else "INACTIVE" end), running: $n}}}' > "$FAKE_AWS_STATE"
  : > "$FAKE_AWS_LOG"
}
running_env() { # <service> -> its app container env as name=value lines
  local s="$1" c="$1"; [ "$s" = api-admin ] && c=api
  jq -r --arg s "$s" --arg c "$c" '.tds[.svcs[$s].td].containerDefinitions[] | select(.name == $c) | .environment[] | "\(.name)=\(.value)"' "$FAKE_AWS_STATE"
}
run() { (cd "$T" && bash "$ROOT/scripts/infra/pooler-roll.sh" lawbid-prod "$@") > "$T/out.log" 2>&1; }

# 1. OFF, phase 1: services on the pooler are moved to the direct database
#    from the revision they RUN (api:1, not the newest api:2), planned pool size.
state "$POOLER" "$POOLER" "$POOLER" "$POOLER" 2
echo '{"off":true,"on":false,"env":{"api":{"DB_POOL_SIZE":"5"},"worker":{"DB_POOL_SIZE":"5"}}}' > "$T/pooler.json"
run drain "$T/pooler.json" || die "drain failed: $(cat "$T/out.log")"
for s in api api-admin worker; do
  E=$(running_env "$s")
  ! grep -q '^DB_POOLER_' <<< "$E" || die "$s still has DB_POOLER_*"
  grep -qx 'DB_POOL_SIZE=5' <<< "$E" || die "$s pool size is not the planned 5"
  grep -qx 'FOO=bar' <<< "$E" || die "$s lost its other variables"
  ! grep -q '^LATEST=' <<< "$E" || die "$s was copied from the newest revision, not the running one"
done
[ "$(jq -r '.svcs.api.td' "$FAKE_AWS_STATE")" = "$(jq -r '.svcs["api-admin"].td' "$FAKE_AWS_STATE")" ] || die "api-admin does not run api's revision"
grep -q '^update api lawbid-prod-api:3$' "$T/calls.log" || die "api was not rolled to api:3"
grep -q '^update worker lawbid-prod-worker:3$' "$T/calls.log" || die "worker was not rolled to worker:3"
jq -e '.tds | to_entries[] | select(.key | endswith("worker:3")) | .value.containerDefinitions[1].image == "x/lawbid-clamav:1.4-debian"' "$FAKE_AWS_STATE" > /dev/null || die "the clamav sidecar changed"
ok "drain moves api, api-admin and worker off the pooler before the apply"

# 2. OFF with planned values unknown: refuse, touch nothing.
state "$POOLER" "$POOLER" "$POOLER" "$POOLER" 2
echo '{"off":true,"on":false,"env":{"api":null,"worker":null}}' > "$T/pooler.json"
if run drain "$T/pooler.json"; then die "drain with unknown values succeeded"; fi
[ ! -s "$T/calls.log" ] || die "drain with unknown values changed something"
grep -q 'unknown before the apply' "$T/out.log" || die "no clear error"
ok "drain refuses (nothing changed) when the planned settings are unknown"

# 3. OFF but the plan still points at the pooler: refuse.
state "$POOLER" "$POOLER" "$POOLER" "$POOLER" 2
echo '{"off":true,"on":false,"env":{"api":{"DB_POOLER_HOST":"x","DB_POOL_SIZE":"10"},"worker":{"DB_POOL_SIZE":"5"}}}' > "$T/pooler.json"
if run drain "$T/pooler.json"; then die "drain onto a pooler succeeded"; fi
[ ! -s "$T/calls.log" ] || die "refused drain changed something"
ok "drain refuses a plan that still points at the pooler"

# 4. OFF when the services are already direct (16.11 left-over): no-op.
state "$DIRECT" "$DIRECT" "$DIRECT" "$DIRECT" 0
echo '{"off":true,"on":false,"env":{"api":{"DB_POOL_SIZE":"5"},"worker":{"DB_POOL_SIZE":"5"}}}' > "$T/pooler.json"
run drain "$T/pooler.json" || die "no-op drain failed: $(cat "$T/out.log")"
[ ! -s "$T/calls.log" ] || die "no-op drain changed something"
ok "drain does nothing when nobody uses the pooler"

# 5. ON (and the 16.11 left-over: services direct, Terraform re-created the
#    pooler): after the apply the services move onto Terraform's revision.
state "$DIRECT" "$POOLER" "$DIRECT" "$POOLER" 2
run align || die "align failed: $(cat "$T/out.log")"
for s in api api-admin worker; do
  E=$(running_env "$s")
  grep -qx 'DB_POOLER_HOST=pgbouncer.lawbid-prod.internal' <<< "$E" || die "$s is not on the pooler"
  grep -qx 'DB_POOL_SIZE=10' <<< "$E" || die "$s pool size is not Terraform's 10"
done
grep -qx 'LATEST=1' <<< "$(running_env api)" || die "api was not copied from Terraform's newest revision"
ok "align moves api, api-admin and worker onto the pooler after the apply"

# 6. ON but PgBouncer runs no task: refuse, stay direct.
state "$DIRECT" "$POOLER" "$DIRECT" "$POOLER" 0
if run align; then die "align onto a missing pooler succeeded"; fi
[ ! -s "$T/calls.log" ] || die "align onto a missing pooler changed something"
ok "align never moves the services onto a pooler that does not run"

# 7. 16.11 incident shape: pooler gone, services still point at it, Terraform's
#    revision is direct: align heals it.
state "$POOLER" "$DIRECT" "$POOLER" "$DIRECT" 0
run align || die "healing align failed: $(cat "$T/out.log")"
for s in api api-admin worker; do ! grep -q '^DB_POOLER_' <<< "$(running_env "$s")" || die "$s still on the gone pooler"; done
ok "align moves the services off a pooler Terraform removed"

# 8. Everything already matches: no-op.
state "$POOLER" "$POOLER" "$POOLER" "$POOLER" 2
run align || die "no-op align failed: $(cat "$T/out.log")"
[ ! -s "$T/calls.log" ] || die "no-op align changed something"
ok "align does nothing when the services match Terraform"

# 9. Only api-admin was left behind: api is re-rolled, api-admin follows.
state "$POOLER" "$POOLER" "$POOLER" "$POOLER" 2
jq --arg A "$A" '.tds["\($A)/lawbid-prod-api:0"] = (.tds["\($A)/lawbid-prod-api:1"] | .containerDefinitions[0].environment |= map(select(.name | startswith("DB_POOLER_") | not)))
  | .svcs["api-admin"].td = "\($A)/lawbid-prod-api:0"' "$FAKE_AWS_STATE" > "$T/s" && mv "$T/s" "$FAKE_AWS_STATE"
run align || die "api-admin align failed: $(cat "$T/out.log")"
grep -qx 'DB_POOLER_HOST=pgbouncer.lawbid-prod.internal' <<< "$(running_env api-admin)" || die "api-admin not aligned"
ok "align also catches an api-admin left on another setting"

# 10. A deleted (INACTIVE) api-admin that still lists a pooler revision is not
#     a blocker: drain moves api and worker and succeeds.
state "$POOLER" "$POOLER" "$POOLER" "$POOLER" 2
jq '.svcs["api-admin"].status = "INACTIVE"' "$FAKE_AWS_STATE" > "$T/s" && mv "$T/s" "$FAKE_AWS_STATE"
echo '{"off":true,"on":false,"env":{"api":{"DB_POOL_SIZE":"5"},"worker":{"DB_POOL_SIZE":"5"}}}' > "$T/pooler.json"
run drain "$T/pooler.json" || die "drain with a deleted api-admin failed: $(cat "$T/out.log")"
! grep -q '^update api-admin' "$T/calls.log" || die "a deleted api-admin was updated"
ok "drain ignores a deleted api-admin"

# Row 204 (task_role_split): api-admin on its own family lawbid-prod-api-admin
# (own task role). own_admin <env of api-admin:1> <env of api-admin:2 (newest)>
own_admin() {
  jq --arg A "$A" --argjson m1 "$(td lawbid-prod-api-admin api "$1" | jq '.taskRoleArn = "role/lawbid-prod-ecs-task-admin"')" \
    --argjson m2 "$(td lawbid-prod-api-admin api "$2" | jq '.taskRoleArn = "role/lawbid-prod-ecs-task-admin" | .containerDefinitions[0].environment += [{name:"LATEST",value:"1"}]')" \
    '.tds["\($A)/lawbid-prod-api-admin:1"] = $m1 | .tds["\($A)/lawbid-prod-api-admin:2"] = $m2
     | .svcs["api-admin"].td = "\($A)/lawbid-prod-api-admin:1"' "$FAKE_AWS_STATE" > "$T/s" && mv "$T/s" "$FAKE_AWS_STATE"
}
admin_td() { jq -r '.svcs["api-admin"].td' "$FAKE_AWS_STATE"; }
admin_role() { jq -r '.tds[.svcs["api-admin"].td].taskRoleArn' "$FAKE_AWS_STATE"; }

# 11. drain: api-admin stays on its own family (own role), off the pooler.
state "$POOLER" "$POOLER" "$POOLER" "$POOLER" 2
own_admin "$POOLER" "$POOLER"
echo '{"off":true,"on":false,"env":{"api":{"DB_POOL_SIZE":"5"},"worker":{"DB_POOL_SIZE":"5"}}}' > "$T/pooler.json"
run drain "$T/pooler.json" || die "drain with an own api-admin family failed: $(cat "$T/out.log")"
case "$(admin_td)" in */lawbid-prod-api-admin:3) ;; *) die "api-admin left its own family: $(admin_td)" ;; esac
[ "$(admin_role)" = role/lawbid-prod-ecs-task-admin ] || die "api-admin lost its own task role"
E=$(running_env api-admin)
! grep -q '^DB_POOLER_' <<< "$E" || die "api-admin still has DB_POOLER_*"
grep -qx 'DB_POOL_SIZE=5' <<< "$E" || die "api-admin pool size is not the planned 5"
! grep -q '^LATEST=' <<< "$E" || die "api-admin was copied from the newest revision, not the running one"
ok "drain keeps an own-family api-admin on its family and role"

# 12. align: an own-family api-admin is compared with ITS family's newest.
state "$DIRECT" "$POOLER" "$DIRECT" "$POOLER" 2
own_admin "$DIRECT" "$POOLER"
run align || die "align with an own api-admin family failed: $(cat "$T/out.log")"
case "$(admin_td)" in */lawbid-prod-api-admin:3) ;; *) die "api-admin not rolled within its family: $(admin_td)" ;; esac
grep -qx 'LATEST=1' <<< "$(running_env api-admin)" || die "api-admin not copied from its family's newest revision"
grep -qx 'DB_POOLER_HOST=pgbouncer.lawbid-prod.internal' <<< "$(running_env api-admin)" || die "api-admin not aligned onto the pooler"
[ "$(admin_role)" = role/lawbid-prod-ecs-task-admin ] || die "api-admin lost its own task role"
ok "align rolls an own-family api-admin onto its family's newest revision"

# 13. A normal deploy (roll-services.sh api): api-admin gets a new revision of
#     its own family with api's new image.
state "$DIRECT" "$DIRECT" "$DIRECT" "$DIRECT" 2
own_admin "$DIRECT" "$DIRECT"
(cd "$T" && ECR_REGISTRY=123.dkr.ecr.us-east-1.amazonaws.com bash "$ROOT/scripts/deploy/roll-services.sh" lawbid-prod newtag api) > "$T/out.log" 2>&1 \
  || die "deploy roll failed: $(cat "$T/out.log")"
case "$(admin_td)" in */lawbid-prod-api-admin:3) ;; *) die "deploy put api-admin on $(admin_td)" ;; esac
[ "$(jq -r '.tds[.svcs["api-admin"].td].containerDefinitions[0].image' "$FAKE_AWS_STATE")" = 123.dkr.ecr.us-east-1.amazonaws.com/lawbid-api:newtag ] || die "api-admin did not get api's new image"
[ "$(admin_role)" = role/lawbid-prod-ecs-task-admin ] || die "deploy dropped api-admin's own task role"
grep -qx 'APP_VERSION=newtag' <<< "$(running_env api-admin)" || die "api-admin APP_VERSION not newtag"
ok "deploy gives an own-family api-admin api's image and keeps its role"

# 14. Before the split (api-admin on api's family) a deploy shares api's revision.
state "$DIRECT" "$DIRECT" "$DIRECT" "$DIRECT" 2
(cd "$T" && ECR_REGISTRY=123.dkr.ecr.us-east-1.amazonaws.com bash "$ROOT/scripts/deploy/roll-services.sh" lawbid-prod newtag api) > "$T/out.log" 2>&1 \
  || die "deploy roll (shared) failed: $(cat "$T/out.log")"
[ "$(jq -r '.svcs.api.td' "$FAKE_AWS_STATE")" = "$(admin_td)" ] || die "shared api-admin did not follow api's revision"
ok "deploy before the split keeps api-admin on api's revision"

echo "pooler-roll: $PASS passed"
