#!/usr/bin/env sh
# Б1 (25.11): error budget gate before a production release.
#
# Policy: docs/runbooks/error-budget-policy.md (after the Google SRE Workbook,
# appendix "Example Error Budget Policy"): when an SLO has spent its error
# budget over the last 28 days, only fixes, reverts and security changes ship.
# The budget is measured by infra/modules/monitoring/error-budget.tf; this
# script only reads its alarms `<cluster>-slo-<flow>-budget-exhausted`.
#
#   budget-gate.sh <cluster> <image tag (git sha)>
#   LAST_GOOD_TAG   release running now (SSM last_good_tag); "" = unknown
#   BUDGET_GATE     on (default) | warn (report, never stop) | off (skip).
#                   Repository variable, the owner's override: see the policy.
#   BUDGET_GATE_TRIES  describe-alarms attempts before giving up (default 3)
#
# A release passes while budgets are spent when it is
#   * a rollback: the tag is the running release or older than it, or
#   * made only of fixes: every first-parent commit since the running release
#     (only the tag itself when that is unknown) has a subject starting with
#     fix: / fix(...): / revert: / Revert " / security: (also with "!").
set -eu
CLUSTER="$1"; TAG="$2"
MODE="${BUDGET_GATE:-on}"
LAST="${LAST_GOOD_TAG:-}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
say() { echo "$1"; echo "$1" >> "$SUMMARY"; }

case "$MODE" in
  off) say "budget gate: OFF (repository variable BUDGET_GATE=off, owner override; docs/runbooks/error-budget-policy.md)"; exit 0 ;;
  on|warn) ;;
  *) echo "::error::BUDGET_GATE must be on, warn or off (got '$MODE')"; exit 1 ;;
esac

tries="${BUDGET_GATE_TRIES:-3}"; n=0; FIRING=""
while :; do
  n=$((n + 1))
  if OUT=$(aws cloudwatch describe-alarms --alarm-name-prefix "${CLUSTER}-slo-" --state-value ALARM \
      --query 'MetricAlarms[].AlarmName' --output text 2>&1); then
    FIRING=$(printf '%s\n' "$OUT" | tr -s '\t ' '\n' | grep -e '-budget-exhausted$' | sort | tr '\n' ' ' || true)
    break
  fi
  if [ "$n" -ge "$tries" ]; then
    if [ "$MODE" = "warn" ]; then say "budget gate (warn): could not read the alarms: $OUT"; exit 0; fi
    echo "::error::budget gate: could not read the error budget alarms after $n tries: $OUT"
    echo "::error::Owner override: repository variable BUDGET_GATE=off (docs/runbooks/error-budget-policy.md)."
    exit 1
  fi
  sleep "${BUDGET_GATE_SLEEP:-5}"
done

if [ -z "$FIRING" ]; then say "budget gate: every SLO has error budget left over 28 days, release allowed"; exit 0; fi
say "budget gate: error budget spent: $FIRING"

# 1) Rollback: the tag is the running release or one of its ancestors.
if [ -n "$LAST" ] && git merge-base --is-ancestor "$TAG" "$LAST" 2>/dev/null; then
  say "budget gate: $TAG is the running release or older (a rollback), allowed"; exit 0
fi

# 2) Only fixes since the running release.
if [ -n "$LAST" ] && git merge-base --is-ancestor "$LAST" "$TAG" 2>/dev/null; then
  SUBJECTS=$(git log --first-parent --format=%s "$LAST..$TAG")
else
  SUBJECTS=$(git log -1 --format=%s "$TAG")
fi
NOT_FIX=$(printf '%s\n' "$SUBJECTS" | grep -v -E '^((fix|revert|security)(\([^)]*\))?!?:|Revert ")' | grep -v '^$' || true)
if [ -z "$NOT_FIX" ]; then
  say "budget gate: the release has only fixes / reverts / security changes, allowed"; exit 0
fi
say "budget gate: not a fix (policy: only fix: / revert: / security: ship while a budget is spent):"
printf '%s\n' "$NOT_FIX" | sed 's/^/  - /' | tee -a "$SUMMARY"
if [ "$MODE" = "warn" ]; then say "budget gate (warn): would stop this release; continuing"; exit 0; fi
echo "::error::Error budget spent ($FIRING). Feature releases are halted until the budget recovers (docs/runbooks/error-budget-policy.md). Ship a fix (commit subject fix: / revert: / security:), or the owner sets repository variable BUDGET_GATE=off and writes the reason in the policy log."
exit 1
