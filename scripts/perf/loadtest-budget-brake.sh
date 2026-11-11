#!/usr/bin/env bash
# The money brake around the load test (owner order 11: "after the test, put
# the spending threshold back to $450").
#
# What the brake is (infra/modules/budget + apps/api ops-guard.job.ts):
#   * AWS Budgets `lawbid-prod-monthly`, limit = terraform var monthly_budget_usd
#     (owner's tfvars: 450). E-mails at 50 / 80 / 100 % and on the forecast.
#   * The worker reads that budget every hour (ops.cost-check): at 100 % of the
#     REAL spend it holds API/worker autoscaling at the minimum until next month
#     (admin switch ops.auto_scale_down_on_budget). The budget is account-wide,
#     so the load-test copy's bill counts toward it: if the month is already
#     near $450, the test could trip the brake ON PRODUCTION.
#   * The test stack itself has no budget (ephemeral), its own brakes are set
#     to manual ceilings by loadtest/sql/loadtest-extra.sql.
#
#   loadtest-budget-brake.sh check            # read-only: limit, spent, forecast, headroom
#   loadtest-budget-brake.sh raise [600]      # prints the owner's two commands (no change here)
#   loadtest-budget-brake.sh restore          # prints the commands to put 450 back
# Changing the budget is a Terraform variable: ONLY the owner applies it (STRICT
# RULES "Только владелец": terraform). This script never writes to AWS.
set -euo pipefail
NAME="${BUDGET_NAME:-lawbid-prod-monthly}"
RESTORE_USD="${RESTORE_USD:-450}"
TEST_RESERVE_USD="${TEST_RESERVE_USD:-100}" # the whole ladder (smoke+u1k+u10k+u100k) is about $33, upper bound $50; x2 for a repeat

check() {
  command -v aws >/dev/null || { echo "aws CLI missing"; exit 2; }
  local acct; acct="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || { echo "not logged in to AWS (aws login) - cannot read the budget"; exit 1; }
  local j; j="$(aws budgets describe-budget --account-id "$acct" --budget-name "$NAME" --output json 2>/dev/null)" || { echo "budget $NAME not found in account $acct"; exit 1; }
  local limit spent forecast
  limit="$(jq -r '.Budget.BudgetLimit.Amount' <<<"$j")"
  spent="$(jq -r '.Budget.CalculatedSpend.ActualSpend.Amount // "0"' <<<"$j")"
  forecast="$(jq -r '.Budget.CalculatedSpend.ForecastedSpend.Amount // "0"' <<<"$j")"
  printf 'budget %s: limit $%.0f, spent so far $%.2f, forecast for the month $%.2f\n' "$NAME" "$limit" "$spent" "$forecast"
  local headroom; headroom="$(jq -n --argjson l "$limit" --argjson s "$spent" '$l - $s')"
  printf 'headroom now: $%.2f; the test ladder needs about $%s of it\n' "$headroom" "$TEST_RESERVE_USD"
  if jq -e -n --argjson h "$headroom" --argjson r "$TEST_RESERVE_USD" '$h < $r * 1.5' >/dev/null; then
    echo "VERDICT: raise the budget for the test month first ($0 raise), then restore $RESTORE_USD after."
  else
    echo "VERDICT: enough headroom, the $RESTORE_USD threshold can stay; the 80 % e-mail may still arrive, that is fine."
  fi
}

print_change() {
  local usd="$1"
  cat <<TXT
Owner steps (terraform, owner only; ~5 minutes, no downtime):
  1. In the prod tfvars (secret lawbid-prod/terraform-tfvars, local copy .claude/tmp/terraform-tfvars-merged.tfvars):
       monthly_budget_usd = $usd
     aws secretsmanager put-secret-value --secret-id lawbid-prod/terraform-tfvars --secret-string file://<the file>
  2. cd infra/envs/prod && terraform plan   -> exactly ONE change: aws_budgets_budget ... limit_amount $usd
     terraform apply
  3. Check: $0 check   (limit must read $usd)
The app needs no restart: ops.cost-check reads the budget every hour.
TXT
}

case "${1:-}" in
  check) check;;
  raise) print_change "${2:-600}";;
  restore) print_change "$RESTORE_USD";;
  *) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 2;;
esac
