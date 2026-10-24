#!/usr/bin/env bash
# Hourly watchdog (.github/workflows/load-test-watchdog.yml): finds every
# load-test stack older than MAX_AGE_HOURS (default 4) by its tag, destroys it
# (Terraform with the stack's own state; if that fails, sweep.sh), prints what
# it found, and FAILS the job when it had to clean something up (a red run =
# an e-mail from GitHub: a normal run never leaves anything behind).
# Needs: aws CLI with the watchdog role, terraform, jq, date (GNU).
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
max_h="${MAX_AGE_HOURS:-4}"
bucket="${STATE_BUCKET:-lawbid-prod-tfstate}"; lock="${LOCK_TABLE:-lawbid-prod-tflock}"; region="${AWS_REGION:-us-east-1}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
cutoff=$(( $(date +%s) - max_h * 3600 ))
cleaned=0; problems=0; young=0; unknown_n=0

say() { echo "$*"; echo "$*" >>"$summary"; }

json="$(aws resourcegroupstaggingapi get-resources --region "$region" --tag-filters Key=Project,Values=lawbid-loadtest --output json)"
# one line per run: "<RunId> <CreatedAt> <count>"; resources without a RunId tag are grouped as "unknown"
runs="$(jq -r '[.ResourceTagMappingList[] | {run: ((.Tags[]|select(.Key=="RunId")|.Value) // "unknown"), at: ((.Tags[]|select(.Key=="CreatedAt")|.Value) // "unknown")}]
  | group_by(.run) | .[] | "\(.[0].run) \(.[0].at) \(length)"' <<<"$json")"
say "## Load-test watchdog $(date -u +%FT%TZ)"
if [ -z "$runs" ]; then say "No resource tagged Project=lawbid-loadtest. Nothing to do."; fi

while read -r run at n; do
  [ -z "$run" ] && continue
  if [ "$run" = unknown ] || [ "$at" = unknown ]; then
    say "- $n tagged resources WITHOUT a RunId/CreatedAt tag: handled at the end, only when no run is in progress"
    unknown_n=$n; continue
  fi
  if [ "$at" = 1970-01-01T00:00:00Z ]; then age_s=99999999; else age_s=$(( $(date +%s) - $(date -d "$at" +%s 2>/dev/null || echo 0) )); fi
  say "- run \`$run\`: $n tagged resources, created \`$at\` (age $((age_s / 3600)) h)"
  if [ "$age_s" -lt $(( max_h * 3600 )) ]; then say "  younger than ${max_h} h: left alone (a run may be in progress)"; young=1; continue; fi
  say "  OLDER THAN ${max_h} h: destroying"
  cleaned=1
  ok=0
  if aws s3api head-object --bucket "$bucket" --key "loadtest/$run/terraform.tfstate" >/dev/null 2>&1; then
    ( cd "$repo/infra/envs/loadtest" \
      && terraform init -input=false -reconfigure -backend-config="bucket=$bucket" -backend-config="key=loadtest/$run/terraform.tfstate" \
           -backend-config="region=$region" -backend-config="dynamodb_table=$lock" -backend-config="encrypt=true" >/dev/null \
      && for try in 1 2 3; do terraform destroy -input=false -auto-approve -var "run_id=$run" -lock-timeout=5m && exit 0; sleep 30; done; exit 1 ) && ok=1
    [ $ok = 1 ] && aws s3 rm "s3://$bucket/loadtest/$run/terraform.tfstate" >/dev/null 2>&1 && say "  terraform destroy done"
  else
    say "  no Terraform state for this run"
  fi
  if [ $ok = 0 ]; then
    say "  terraform could not destroy it: sweeping the costly resources by tag"
    if [ "$run" = unknown ]; then "$here/sweep.sh"; else "$here/sweep.sh" "$run"; fi
    problems=1
  fi
done <<<"$runs"

if [ "$unknown_n" -gt 0 ]; then
  if [ "$young" = 0 ]; then
    say "- no run in progress: sweeping the untagged-run leftovers by tag"; cleaned=1; "$here/sweep.sh" || true; problems=1
  else
    say "- a run is in progress: the untagged leftovers are left for the next watchdog run"
  fi
fi

# state files of runs that left nothing behind are just clutter: remove the old ones
aws s3api list-objects-v2 --bucket "$bucket" --prefix loadtest/ --query 'Contents[?LastModified<`'"$(date -u -d "@$cutoff" +%FT%TZ)"'`].Key' --output text 2>/dev/null | tr '\t' '\n' | grep -E '^loadtest/.+/terraform.tfstate$' | while read -r k; do
  [ -z "$k" ] && continue
  run="$(cut -d/ -f2 <<<"$k")"
  if ! grep -q "^$run " <<<"$runs"; then aws s3 rm "s3://$bucket/$k" >/dev/null 2>&1 && say "- removed old state of finished run \`$run\`"; fi
done

if [ "$young" = 0 ]; then "$here/verify-clean.sh" || problems=1; else say "A younger run is in progress: the final check is left to that run."; fi
if [ "$cleaned" = 1 ]; then say "**The watchdog had to destroy a load-test stack that was left behind** (something went wrong in that run: see its logs)."; fi
[ "$problems" = 0 ] && [ "$cleaned" = 0 ]
