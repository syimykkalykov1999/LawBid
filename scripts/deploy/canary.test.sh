#!/usr/bin/env bash
# Б2 (25.11): scripts/deploy/canary.sh judges the canary task against the
# control (SRE Workbook ch. 16) and watches the business fast-burn SLOs, on the
# fake `aws` of scripts/deploy/fixtures/fake-aws-canary.mjs.
#   bash scripts/deploy/canary.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/canary.XXXXXX")"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
printf '#!/bin/sh\nexec node "%s/scripts/deploy/fixtures/fake-aws-canary.mjs" "$@"\n' "$ROOT" > "$T/bin/aws"
chmod +x "$T/bin/aws"
export PATH="$T/bin:$PATH" FAKE_AWS_STATE="$T/state.json" FAKE_AWS_LOG="$T/calls.log" \
  CANARY_ENABLED=true CANARY_POLL_SECONDS=0 CANARY_COMPARE_SETTLE_SECONDS=0 \
  ECR_REGISTRY=123.dkr.ecr.us-east-1.amazonaws.com
PASS=0
ok() { PASS=$((PASS + 1)); echo "ok - $1"; }
die() { echo "not ok - $1"; echo "--- output:"; cat "$T/out.log" 2>/dev/null || true; echo "--- calls:"; cat "$T/calls.log" 2>/dev/null || true; exit 1; }
# lines <canary 5xx>: the api's minute lines as filter-log-events returns them
# (9 old tasks with 900 requests and 1 error, the canary with 100 requests).
lines() {
  node -e 'const l = (r, q, e) => JSON.stringify({ level: 30, metric: "slo", release: r, httpReq: q, http5xx: e });
    process.stdout.write(JSON.stringify([l("old", 900, 1), l("newtag", 100, Number(process.argv[1]))]));' "$1"
}
state() { # state <firingSeq json> <canary 5xx>
  printf '{"firingSeq":%s,"sloLines":%s}' "$1" "$(lines "$2")" > "$FAKE_AWS_STATE"; : > "$FAKE_AWS_LOG"
}
canary() { (cd "$T" && env "$@" sh "$ROOT/scripts/deploy/canary.sh" lawbid-prod newtag) > "$T/out.log" 2>&1; }

# 1. A canary whose 5xx share is far above the old tasks' fails, though the
#    fleet-wide share (7/1000 = 0.7 %) stays under the 1 % api-5xx-ratio alarm.
state '[[]]' 6
if canary CANARY_BAKE_MINUTES=0; then die "a bad canary passed"; fi
grep -q 'canary vs control: fail' "$T/out.log" || die "no canary-vs-control verdict"
grep -q 'filter-log-events --log-group-name /ecs/lawbid-prod/api' "$T/calls.log" || die "did not read the api log group of the task definition"
grep -q 'delete-service' "$T/calls.log" || die "canary service not removed after the failure"
ok "canary 5xx 6 % vs control 0.11 %: red before the real api is touched"

# 2. A canary as healthy as the control passes.
state '[[]]' 0
canary CANARY_BAKE_MINUTES=0 || die "a healthy canary failed"
grep -q 'canary vs control: pass' "$T/out.log" || die "no pass verdict"
ok "healthy canary passes the comparison"

# 3. A business fast burn (a composite alarm) that starts during the bake fails it.
state '[[],["lawbid-prod-slo-pay-fast"]]' 0
if canary CANARY_BAKE_MINUTES=1; then die "a pay fast burn during the bake passed"; fi
grep -q 'alarm lawbid-prod-slo-pay-fast fired during the bake' "$T/out.log" || die "pay fast burn not reported"
grep -q -- '--alarm-types MetricAlarm CompositeAlarm' "$T/calls.log" || die "composite alarms not asked for"
for a in login message pay; do grep -q "lawbid-prod-slo-$a-fast" "$T/calls.log" || die "slo-$a-fast not watched"; done
ok "login / message / pay fast-burn SLOs are part of the canary judgement"

# 4. Already firing before the canary (an outside Stripe outage) is ignored, as before.
state '[["lawbid-prod-slo-pay-fast"]]' 0
canary CANARY_BAKE_MINUTES=0 || die "a burn that was already firing failed the canary"
grep -q 'already firing before start' "$T/out.log" || die "baseline not reported"
ok "a burn already firing before the canary does not fail it"

# 5. CANARY_COMPARE=off: no log read, alarms only.
state '[[]]' 6
canary CANARY_BAKE_MINUTES=0 CANARY_COMPARE=off || die "off still compared"
if grep -q 'filter-log-events' "$T/calls.log"; then die "off read the logs"; fi
ok "CANARY_COMPARE=off skips the comparison"

echo "canary.test.sh: $PASS passed"
