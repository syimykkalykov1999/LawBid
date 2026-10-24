#!/usr/bin/env bash
# PROOF that nothing of the load test is left: lists every resource tagged
# Project=lawbid-loadtest in both regions (CloudFront and IAM are global and
# show up through us-east-1) and fails if any remains.
#
# Not counted as "left" (AWS keeps them, they cost nothing and cannot be
# removed earlier):  KMS keys waiting for deletion (7 days, free after the
# first hour), inactive ECS task definition revisions, deleted (INACTIVE)
# ECS clusters that the tagging index still lists for about an hour.
# The tagging API can lag a few minutes behind a delete, so it is asked
# again for up to WAIT seconds (default 300) before it fails.
#   verify-clean.sh [--quiet]
set -uo pipefail
WAIT="${WAIT:-300}"
regions="${REGIONS:-us-east-1 us-west-2}"
deadline=$(( $(date +%s) + WAIT ))

list_left() {
  local r arns
  {
  for r in $regions; do
    arns="$(aws resourcegroupstaggingapi get-resources --region "$r" --tag-filters Key=Project,Values=lawbid-loadtest \
      --query 'ResourceTagMappingList[].ResourceARN' --output text 2>/dev/null | tr '\t' '\n' | sed '/^$/d')"
    while read -r arn; do
      [ -z "$arn" ] && continue
      case "$arn" in
        *:task-definition/*) continue;;                                  # inactive revisions
        arn:aws:ecs:*:cluster/*)                                         # a deleted cluster stays INACTIVE in the index for ~1 h
          cstate="$(aws ecs describe-clusters --region "$r" --clusters "$arn" --query 'clusters[0].status' --output text 2>/dev/null || echo Gone)"
          case "$cstate" in INACTIVE|None|Gone) continue;; esac;;
        arn:aws:kms:*:key/*)
          state="$(aws kms describe-key --region "$r" --key-id "$arn" --query KeyMetadata.KeyState --output text 2>/dev/null || echo Gone)"
          case "$state" in PendingDeletion|Gone|PendingReplicaDeletion) continue;; esac;;
      esac
      echo "$r $arn"
    done <<<"$arns"
  done
  # CloudFront key-value stores and functions cannot carry tags: find them by name.
  aws cloudfront list-key-value-stores --query 'KeyValueStoreList.Items[?starts_with(Name, `lawbid-loadtest`)].ARN' --output text 2>/dev/null | tr '\t' '\n' | sed '/^$/d;/^None$/d;s/^/global /'
  aws cloudfront list-functions --query 'FunctionList.Items[?starts_with(Name, `lawbid-loadtest`)].FunctionMetadata.FunctionARN' --output text 2>/dev/null | tr '\t' '\n' | sed '/^$/d;/^None$/d;s/^/global /'
  } | sort -u
}

while :; do
  left="$(list_left)"
  [ -z "$left" ] && break
  [ "$(date +%s)" -gt "$deadline" ] && break
  sleep 20
done

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if [ -z "$left" ]; then
  echo "PROOF: no resource tagged Project=lawbid-loadtest exists in: $regions (checked $now)."
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '### Nothing left running\n\n`No resource tagged Project=lawbid-loadtest exists in %s (checked %s, AWS Resource Groups Tagging API).`\n' "$regions" "$now" >>"$GITHUB_STEP_SUMMARY"
  exit 0
fi
echo "STILL TAGGED Project=lawbid-loadtest ($now):"
echo "$left"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo '### :warning: Resources tagged lawbid-loadtest are STILL THERE'; echo; echo '```'; echo "$left"; echo '```'; echo 'The hourly watchdog will destroy them (older than 4 h); see docs/runbooks/LOAD_TEST.md "Если что-то осталось".'; } >>"$GITHUB_STEP_SUMMARY"
fi
exit 1
