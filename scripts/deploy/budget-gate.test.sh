#!/usr/bin/env bash
# Б1 (25.11): scripts/deploy/budget-gate.sh on a fake `aws` and a throwaway git repo.
#   bash scripts/deploy/budget-gate.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/budget-gate.XXXXXX")"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/repo"
# fake aws: prints $FAKE_FIRING (alarm names in ALARM), or fails when FAKE_AWS_FAIL=1.
cat > "$T/bin/aws" <<'SH'
#!/bin/sh
echo "$*" >> "$FAKE_AWS_LOG"
[ "${FAKE_AWS_FAIL:-0}" = 1 ] && { echo "AccessDenied" >&2; exit 254; }
printf '%s\n' "${FAKE_FIRING:-}" | tr ' ' '\t'
SH
chmod +x "$T/bin/aws"
export PATH="$T/bin:$PATH" FAKE_AWS_LOG="$T/aws.log" BUDGET_GATE_SLEEP=0
PASS=0
ok() { PASS=$((PASS + 1)); echo "ok - $1"; }
die() { echo "not ok - $1"; echo "--- output:"; cat "$T/out.log" 2>/dev/null || true; exit 1; }

cd "$T/repo"
git init -q -b main . && git config user.email t@t && git config user.name t
c() { git commit -q --allow-empty -m "$1"; git rev-parse HEAD; }
OLD=$(c "feat: an older release")
LIVE=$(c "Лента: новая кнопка (#1)")
FIX1=$(c "fix: chat send retried twice (#2)")
FIX2=$(c "revert: «Лента: новая кнопка» (#3)")
FEAT=$(c "Звонки: новый экран (#4)")

gate() { # gate <tag> [env...]
  local tag="$1"; shift
  (env LAST_GOOD_TAG="$LIVE" "$@" sh "$ROOT/scripts/deploy/budget-gate.sh" lawbid-prod "$tag") > "$T/out.log" 2>&1
}
BURN="lawbid-prod-slo-login-fast lawbid-prod-slo-pay-budget-exhausted"

# 1. Budgets left: any release passes, only the budget alarms are read.
: > "$FAKE_AWS_LOG"
gate "$FEAT" FAKE_FIRING="lawbid-prod-slo-login-fast" || die "a fast burn alone must not stop a release (it is not a spent 28-day budget)"
grep -q 'release allowed' "$T/out.log" || die "no pass message"
grep -q -- '--alarm-name-prefix lawbid-prod-slo- --state-value ALARM' "$FAKE_AWS_LOG" || die "did not read the SLO alarms in ALARM"
ok "budget left: a feature release passes"

# 2. Budget spent + a feature in the release: stopped, with the override named.
if gate "$FEAT" FAKE_FIRING="$BURN"; then die "a feature shipped while the pay budget is spent"; fi
grep -q 'lawbid-prod-slo-pay-budget-exhausted' "$T/out.log" || die "does not say which budget"
grep -q 'Звонки: новый экран' "$T/out.log" || die "does not list the commit that is not a fix"
grep -q 'BUDGET_GATE=off' "$T/out.log" || die "does not name the override"
ok "budget spent: a feature release is stopped and the override is named"

# 3. Budget spent + only fixes / reverts since the running release: passes.
gate "$FIX2" FAKE_FIRING="$BURN" || die "fix + revert were stopped"
grep -q 'only fixes' "$T/out.log" || die "no fix message"
ok "budget spent: a release of only fix:/revert: commits passes"

# 4. Budget spent + a rollback to an older release: passes.
gate "$OLD" FAKE_FIRING="$BURN" || die "a rollback was stopped"
grep -q 'a rollback' "$T/out.log" || die "no rollback message"
ok "budget spent: a rollback passes"

# 5. Running release unknown: only the tag's own subject counts.
(env LAST_GOOD_TAG="" FAKE_FIRING="$BURN" sh "$ROOT/scripts/deploy/budget-gate.sh" lawbid-prod "$FIX1") > "$T/out.log" 2>&1 || die "fix with unknown running release stopped"
if (env LAST_GOOD_TAG="" FAKE_FIRING="$BURN" sh "$ROOT/scripts/deploy/budget-gate.sh" lawbid-prod "$FEAT") > "$T/out.log" 2>&1; then die "feature with unknown running release passed"; fi
ok "running release unknown: the tag's own subject decides"

# 6. Owner override off: nothing is read, passes; warn: reports, passes.
: > "$FAKE_AWS_LOG"
gate "$FEAT" FAKE_FIRING="$BURN" BUDGET_GATE=off || die "off did not pass"
[ ! -s "$FAKE_AWS_LOG" ] || die "off still read the alarms"
grep -q 'owner override' "$T/out.log" || die "off is not written down"
gate "$FEAT" FAKE_FIRING="$BURN" BUDGET_GATE=warn || die "warn stopped the release"
grep -q 'would stop this release' "$T/out.log" || die "warn did not report"
if gate "$FEAT" BUDGET_GATE=maybe; then die "a bad BUDGET_GATE value passed"; fi
ok "BUDGET_GATE=off skips (written to the summary), warn only reports, a typo is red"

# 7. CloudWatch cannot be read: red after the retries (warn: passes).
: > "$FAKE_AWS_LOG"
if gate "$FEAT" FAKE_AWS_FAIL=1; then die "unreadable alarms passed"; fi
[ "$(wc -l < "$FAKE_AWS_LOG")" -eq 3 ] || die "expected 3 tries, got $(wc -l < "$FAKE_AWS_LOG")"
gate "$FEAT" FAKE_AWS_FAIL=1 BUDGET_GATE=warn || die "warn stopped on unreadable alarms"
ok "unreadable alarms: red after 3 tries (warn: passes)"

echo "budget-gate.test.sh: $PASS passed"
