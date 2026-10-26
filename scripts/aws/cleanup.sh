#!/usr/bin/env bash
# Deletes ONLY the always-safe leftovers (see docs/runbooks/AWS_CLEANUP.md):
#   1. EBS volumes that are unattached ("available") for more than VOLUME_DAYS
#   2. Elastic IPs that are not associated with anything
#   3. AMIs and snapshots older than SNAPSHOT_DAYS that no instance and no
#      launch template uses (AWS Backup and RDS snapshots are skipped)
#   4. untagged ECR images (never the children of a tagged multi-arch image)
#   5. instances / volumes tagged `lawbid-loadtest` that are older than LOADTEST_HOURS
# Never touched, by design: RDS, ElastiCache, S3 (user media, backups, web),
# ECS, load balancers, anything tagged Protect=true or
# Environment=production-critical. The IAM role of the workflow has no
# permission for any of those either.
#
# DRY_RUN=true (default) only prints what would be deleted.
#   DRY_RUN=false scripts/aws/cleanup.sh "us-east-1,us-west-2"
# Env: VOLUME_DAYS=7 SNAPSHOT_DAYS=35 LOADTEST_HOURS=4 ECR_UNTAGGED_HOURS=24
set -uo pipefail
REGIONS="${1:-${AWS_REGION:-us-east-1}}"
DRY_RUN="${DRY_RUN:-true}"
VOLUME_DAYS="${VOLUME_DAYS:-7}"
SNAPSHOT_DAYS="${SNAPSHOT_DAYS:-35}"
LOADTEST_HOURS="${LOADTEST_HOURS:-4}"
ECR_UNTAGGED_HOURS="${ECR_UNTAGGED_HOURS:-24}"
NOW=$(date +%s)
STATE=$(mktemp)
trap 'rm -f "$STATE"' EXIT

age_hours() { echo $(((NOW - $(date -d "$1" +%s 2>/dev/null || echo "$NOW")) / 3600)); }
# act <description> <command...>
act() {
  local what="$1"
  shift
  if [ "$DRY_RUN" = "true" ]; then
    echo "[dry-run] would delete: $what"
  else
    if "$@" >/dev/null 2>&1; then echo "deleted: $what"; echo ok >>"$STATE"; else echo "FAILED: $what"; echo fail >>"$STATE"; fi
  fi
}
# jq filter: true when the resource carries a protecting tag
PROTECTED='((.Tags // []) | any((.Key == "Protect" and .Value == "true") or (.Key == "Environment" and .Value == "production-critical")))'

echo "Mode: $([ "$DRY_RUN" = "true" ] && echo "DRY RUN (nothing is deleted)" || echo "REAL DELETE")"

IFS=',' read -ra RG <<<"$REGIONS"
for R in "${RG[@]}"; do
  R=$(echo "$R" | tr -d ' ')
  [ -n "$R" ] || continue
  A="aws --region $R"
  echo
  echo "=== $R ==="

  echo "-- 1. unattached EBS volumes older than ${VOLUME_DAYS} days"
  $A ec2 describe-volumes --filters Name=status,Values=available --output json 2>/dev/null |
    jq -r "[.Volumes[] | select($PROTECTED | not) | [.VolumeId, .CreateTime, (.Size|tostring)]] | .[] | @tsv" |
    while IFS=$'\t' read -r id created size; do
      [ "$(age_hours "$created")" -ge $((VOLUME_DAYS * 24)) ] || continue
      act "volume $id (${size} GB, created ${created%%T*})" $A ec2 delete-volume --volume-id "$id"
    done

  echo "-- 2. unassociated Elastic IPs"
  $A ec2 describe-addresses --output json 2>/dev/null |
    jq -r "[.Addresses[] | select(.AssociationId == null and .InstanceId == null and .NetworkInterfaceId == null) | select($PROTECTED | not) | [.AllocationId // \"\", .PublicIp]] | .[] | @tsv" |
    while IFS=$'\t' read -r alloc ip; do
      [ -n "$alloc" ] || continue
      act "Elastic IP $ip ($alloc)" $A ec2 release-address --allocation-id "$alloc"
    done

  echo "-- 3. old AMIs and snapshots nothing uses (older than ${SNAPSHOT_DAYS} days)"
  USED_AMIS=$($A ec2 describe-instances --query 'Reservations[].Instances[].ImageId' --output text 2>/dev/null | tr '\t' '\n')
  for lt in $($A ec2 describe-launch-templates --query 'LaunchTemplates[].LaunchTemplateId' --output text 2>/dev/null); do
    USED_AMIS="$USED_AMIS
$($A ec2 describe-launch-template-versions --launch-template-id "$lt" --versions '$Latest' '$Default' \
      --query 'LaunchTemplateVersions[].LaunchTemplateData.ImageId' --output text 2>/dev/null | tr '\t' '\n')"
  done
  ALL_AMI_SNAPS=$($A ec2 describe-images --owners self --query 'Images[].BlockDeviceMappings[].Ebs.SnapshotId' --output text 2>/dev/null | tr '\t' '\n')
  $A ec2 describe-images --owners self --output json 2>/dev/null |
    jq -r "[.Images[] | select($PROTECTED | not) | [.ImageId, .CreationDate, ([.BlockDeviceMappings[].Ebs.SnapshotId // empty] | join(\",\"))]] | .[] | @tsv" |
    while IFS=$'\t' read -r ami created snaps; do
      [ "$(age_hours "$created")" -ge $((SNAPSHOT_DAYS * 24)) ] || continue
      echo "$USED_AMIS" | grep -qx "$ami" && continue
      act "AMI $ami (created ${created%%T*})" $A ec2 deregister-image --image-id "$ami"
      for sn in ${snaps//,/ }; do
        act "snapshot $sn of AMI $ami" $A ec2 delete-snapshot --snapshot-id "$sn"
      done
    done
  $A ec2 describe-snapshots --owner-ids self --output json 2>/dev/null |
    jq -r "[.Snapshots[] | select($PROTECTED | not)
      | select((.Tags // []) | any(.Key | startswith(\"aws:backup\")) | not)
      | select((.Description // \"\") | test(\"AWS Backup|rds:|Created by CreateImage\") | not)
      | [.SnapshotId, .StartTime]] | .[] | @tsv" |
    while IFS=$'\t' read -r sn started; do
      [ "$(age_hours "$started")" -ge $((SNAPSHOT_DAYS * 24)) ] || continue
      echo "$ALL_AMI_SNAPS" | grep -qx "$sn" && continue # an AMI (even an unused one) owns it: step above
      act "snapshot $sn (started ${started%%T*})" $A ec2 delete-snapshot --snapshot-id "$sn"
    done

  echo "-- 4. untagged ECR images older than ${ECR_UNTAGGED_HOURS} h (not children of a tagged multi-arch image)"
  for repo in $($A ecr describe-repositories --query 'repositories[].repositoryName' --output text 2>/dev/null); do
    DETAILS=$($A ecr describe-images --repository-name "$repo" --output json 2>/dev/null)
    CHILDREN=""
    for d in $(echo "$DETAILS" | jq -r '.imageDetails[] | select(.imageTags != null) | .imageDigest'); do
      CHILDREN="$CHILDREN
$($A ecr batch-get-image --repository-name "$repo" --image-ids imageDigest="$d" --query 'images[0].imageManifest' --output text 2>/dev/null |
        jq -r '.manifests[]?.digest' 2>/dev/null)"
    done
    echo "$DETAILS" | jq -r '.imageDetails[] | select(.imageTags == null) | [.imageDigest, .imagePushedAt] | @tsv' |
      while IFS=$'\t' read -r digest pushed; do
        [ "$(age_hours "$pushed")" -ge "$ECR_UNTAGGED_HOURS" ] || continue
        echo "$CHILDREN" | grep -qx "$digest" && continue
        act "ECR image $repo@${digest:0:19}" $A ecr batch-delete-image --repository-name "$repo" --image-ids imageDigest="$digest"
      done
  done

  echo "-- 5. load-test leftovers (tag lawbid-loadtest) older than ${LOADTEST_HOURS} h"
  $A ec2 describe-instances --filters Name=tag-key,Values=lawbid-loadtest Name=instance-state-name,Values=pending,running,stopping,stopped --output json 2>/dev/null |
    jq -r "[.Reservations[].Instances[] | select($PROTECTED | not) | [.InstanceId, .LaunchTime]] | .[] | @tsv" |
    while IFS=$'\t' read -r id launched; do
      [ "$(age_hours "$launched")" -ge "$LOADTEST_HOURS" ] || continue
      act "load-test instance $id (launched $launched)" $A ec2 terminate-instances --instance-ids "$id"
    done
  $A ec2 describe-volumes --filters Name=tag-key,Values=lawbid-loadtest Name=status,Values=available --output json 2>/dev/null |
    jq -r "[.Volumes[] | select($PROTECTED | not) | [.VolumeId, .CreateTime]] | .[] | @tsv" |
    while IFS=$'\t' read -r id created; do
      [ "$(age_hours "$created")" -ge "$LOADTEST_HOURS" ] || continue
      act "load-test volume $id" $A ec2 delete-volume --volume-id "$id"
    done
  echo "   other load-test resources (databases, load balancers, ...) are only listed, never deleted here:"
  $A resourcegroupstaggingapi get-resources --tag-filters Key=lawbid-loadtest --query 'ResourceTagMappingList[].ResourceARN' --output text 2>/dev/null |
    tr '\t' '\n' | grep -v ':instance/\|:volume/' | sed 's/^/   - /'
done

echo
if [ "$DRY_RUN" = "true" ]; then
  echo "Dry run finished. Run again with dry_run = false to delete the lines above."
else
  echo "Deleted: $(grep -c '^ok$' "$STATE"), failed: $(grep -c '^fail$' "$STATE")"
  ! grep -q '^fail$' "$STATE"
fi
