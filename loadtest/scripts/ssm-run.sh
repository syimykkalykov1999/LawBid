#!/usr/bin/env bash
# Run a shell command on ONE generator box through SSM Run Command and wait
# for it (no SSH, no inbound port). Prints the command output; exit code 0
# only when the command succeeded on the box.
#   ssm-run.sh <instance-id> <timeout-seconds> '<shell command>'
set -uo pipefail
id="${1:?instance id}"; timeout_s="${2:?timeout seconds}"; cmd="${3:?command}"
region="${AWS_REGION:-us-east-1}"
cid="$(aws ssm send-command --region "$region" --instance-ids "$id" \
  --document-name AWS-RunShellScript --timeout-seconds "$((timeout_s > 30 ? timeout_s : 30))" \
  --comment "lawbid-loadtest" \
  --parameters "$(jq -cn --arg c "$cmd" '{commands: ["set -eo pipefail", $c], executionTimeout: ["'"$timeout_s"'"]}')" \
  --query 'Command.CommandId' --output text)" || { echo "send-command failed for $id" >&2; exit 1; }
echo "[ssm] $id command $cid"
deadline=$(( $(date +%s) + timeout_s + 60 ))
while :; do
  status="$(aws ssm get-command-invocation --region "$region" --command-id "$cid" --instance-id "$id" --query Status --output text 2>/dev/null || echo Pending)"
  case "$status" in
    Success) break;;
    Failed|Cancelled|TimedOut|Cancelling) break;;
  esac
  if [ "$(date +%s)" -gt "$deadline" ]; then
    aws ssm cancel-command --region "$region" --command-id "$cid" >/dev/null 2>&1 || true
    status=TimedOut; break
  fi
  sleep 10
done
aws ssm get-command-invocation --region "$region" --command-id "$cid" --instance-id "$id" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text 2>/dev/null | tail -n 80
echo "[ssm] $id -> $status"
[ "$status" = Success ]
