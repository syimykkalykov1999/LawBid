#!/usr/bin/env bash
# READ-ONLY inventory of the AWS account: every resource by service, what looks
# unused / idle / forgotten (marked "FLAG"), and the last 30 days of cost by
# service. Writes Markdown to stdout. Deletes nothing, changes nothing.
# Needs: aws CLI v2, jq, GNU date (ubuntu runner). Used by
# .github/workflows/aws-inventory.yml; see docs/runbooks/AWS_CLEANUP.md.
#
#   scripts/aws/inventory.sh "us-east-1,us-west-2"
#
# Every call is allowed to fail (a missing permission prints "n/a") so one
# missing right never loses the rest of the report. The report holds names,
# ids, sizes, dates and tag values only - no secrets, no object contents.
set -uo pipefail
REGIONS="${1:-${AWS_REGION:-us-east-1}}"
IDLE_DAYS=7
OLD_SNAPSHOT_DAYS=35 # a bit above the 35-day AWS Backup / RDS retention
NOW=$(date +%s)
SINCE_ISO=$(date -u -d "-${IDLE_DAYS} days" +%Y-%m-%dT%H:%M:%SZ)
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# rows <header cols separated by |> <jq program producing arrays> : reads JSON on stdin
rows() {
  local head="$1" prog="$2" n sep
  local data
  data=$(jq -r "$prog | @tsv" 2>/dev/null | sed 's/\t/ | /g; s/^/| /; s/$/ |/')
  if [ -z "$data" ]; then echo "_none_"; echo; return; fi
  n=$(printf '%s' "$head" | tr -cd '|' | wc -c)
  sep=$(printf -- '---|%.0s' $(seq 0 "$n"))
  echo "| $head |"
  echo "|$sep"
  echo "$data"
  echo
}
# Tags as "k=v, k=v" from an AWS Tags array
TAGS='((.Tags // .TagList // []) | map("\(.Key)=\(.Value)") | join(", "))'
age_days() { echo $(((NOW - $(date -d "$1" +%s 2>/dev/null || echo "$NOW")) / 86400)); }

echo "# AWS inventory"
echo
echo "Generated $NOW_ISO (UTC). Regions: $REGIONS. Read-only: nothing was changed."
echo "Lines marked **FLAG** are candidates to look at; the list is advice, not an order."
echo

# ---------------------------------------------------------------- cost
echo "## Cost, last 30 days, by service (USD, Cost Explorer)"
echo
START=$(date -u -d "-30 days" +%F)
END=$(date -u +%F)
aws ce get-cost-and-usage --region us-east-1 --time-period "Start=$START,End=$END" \
  --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE \
  --output json 2>/dev/null |
  jq '[.ResultsByTime[].Groups[] | {s: .Keys[0], c: (.Metrics.UnblendedCost.Amount | tonumber)}]
      | group_by(.s) | map({s: .[0].s, c: (map(.c) | add)}) | sort_by(-.c) | .[]
      | select(.c >= 0.01) | [.s, (.c * 100 | round / 100 | tostring)]' 2>/dev/null |
  jq -s '.' | rows "Service | USD" '.[]' || echo "n/a (no Cost Explorer permission)"
echo

# ---------------------------------------------------------------- s3 (global)
echo "## S3 buckets"
echo
echo "Size and object count come from CloudWatch daily metrics (can be a day old). Buckets not named lawbid-* are flagged as foreign."
echo
BUCKETS=$(aws s3api list-buckets --output json 2>/dev/null)
echo "| Bucket | Created | Region | Objects | Size GB | Lifecycle rules | Tags | Notes |"
echo "|---|---|---|---|---|---|---|---|"
echo "$BUCKETS" | jq -r '.Buckets[]? | [.Name, .CreationDate] | @tsv' | while IFS=$'\t' read -r name created; do
  loc=$(aws s3api get-bucket-location --bucket "$name" --query LocationConstraint --output text 2>/dev/null || echo "?")
  [ "$loc" = "None" ] && loc="us-east-1"
  [ "$loc" = "EU" ] && loc="eu-west-1"
  cw() { aws cloudwatch get-metric-statistics --region "$loc" --namespace AWS/S3 --metric-name "$1" \
    --dimensions "Name=BucketName,Value=$name" "Name=$2" --start-time "$(date -u -d '-3 days' +%FT%TZ)" \
    --end-time "$NOW_ISO" --period 86400 --statistics Average --query 'Datapoints | sort_by(@, &Timestamp)[-1].Average' --output text 2>/dev/null; }
  objs=$(cw NumberOfObjects "StorageType=AllStorageTypes")
  bytes=$(cw BucketSizeBytes "StorageType=StandardStorage")
  [ -z "$objs" ] || [ "$objs" = "None" ] && objs="?"
  [ -z "$bytes" ] || [ "$bytes" = "None" ] && bytes="?"
  gb="?"
  [ "$bytes" != "?" ] && gb=$(awk "BEGIN{printf \"%.2f\", $bytes/1073741824}")
  rules=$(aws s3api get-bucket-lifecycle-configuration --bucket "$name" --query 'length(Rules)' --output text 2>/dev/null || echo 0)
  tags=$(aws s3api get-bucket-tagging --bucket "$name" --output json 2>/dev/null | jq -r "$(printf '{Tags: .TagSet} | %s' "$TAGS")" 2>/dev/null)
  notes=""
  case "$name" in lawbid-*) ;; *) notes="$notes FLAG foreign name;" ;; esac
  [ "$objs" = "0" ] || [ "$objs" = "0.0" ] && notes="$notes FLAG empty;"
  [ "$rules" = "0" ] && notes="$notes FLAG no lifecycle rule;"
  [ -z "$tags" ] && notes="$notes FLAG untagged;"
  [ "$(age_days "$created")" -gt 90 ] && [ "$objs" = "0" ] && notes="$notes FLAG old and empty;"
  echo "| $name | ${created%%T*} | $loc | $objs | $gb | $rules | ${tags:--} | ${notes:--} |"
done
echo

# ---------------------------------------------------------------- global ECR/CF
echo "## CloudFront distributions (global)"
echo
aws cloudfront list-distributions --output json 2>/dev/null |
  jq '.DistributionList.Items // [] | map([.Id, .DomainName, (.Aliases.Items // [] | join(",")), .Status, (.Enabled | tostring)]) | .[]' |
  jq -s '.' | rows "Id | Domain | Aliases | Status | Enabled" '.[]'

# ---------------------------------------------------------------- per region
IFS=',' read -ra RG <<<"$REGIONS"
for R in "${RG[@]}"; do
  R=$(echo "$R" | tr -d ' ')
  [ -n "$R" ] || continue
  A="aws --region $R"
  echo "# Region $R"
  echo

  echo "## EC2 instances ($R)"
  echo
  $A ec2 describe-instances --output json 2>/dev/null | jq "[.Reservations[].Instances[] | select(.State.Name != \"terminated\") |
    [.InstanceId, .InstanceType, .State.Name, (.LaunchTime | split(\"T\")[0]), $TAGS,
     ([ (if .State.Name == \"stopped\" then \"FLAG stopped\" else empty end),
        (if ((.Tags // []) | map(.Key) | index(\"lawbid-loadtest\")) then \"FLAG load-test tag\" else empty end),
        (if ((.Tags // []) | length) == 0 then \"FLAG untagged\" else empty end) ] | join(\"; \"))]] | .[]" |
    jq -s '.' | rows "Id | Type | State | Launched | Tags | Notes" '.[]'

  echo "## EBS volumes ($R)"
  echo
  $A ec2 describe-volumes --output json 2>/dev/null | jq "[.Volumes[] |
    [.VolumeId, (.Size | tostring) + \" GB\", .State, (.CreateTime | split(\"T\")[0]), $TAGS,
     (if .State == \"available\" then \"FLAG unattached\" else \"\" end)]] | .[]" |
    jq -s '.' | rows "Id | Size | State | Created | Tags | Notes" '.[]'

  echo "## Elastic IPs ($R)"
  echo
  $A ec2 describe-addresses --output json 2>/dev/null | jq "[.Addresses[] |
    [.PublicIp, (.AllocationId // \"-\"), (.AssociationId // \"-\"), $TAGS,
     (if .AssociationId == null then \"FLAG unassociated (billed hourly)\" else \"\" end)]] | .[]" |
    jq -s '.' | rows "IP | Allocation | Association | Tags | Notes" '.[]'

  echo "## EBS snapshots and AMIs owned by this account ($R)"
  echo
  # Snapshots in use by an AMI or created by AWS Backup / RDS are listed but not flagged.
  AMI_SNAPS=$($A ec2 describe-images --owners self --output json 2>/dev/null | jq -r '[.Images[].BlockDeviceMappings[]?.Ebs.SnapshotId // empty] | join(" ")')
  $A ec2 describe-snapshots --owner-ids self --output json 2>/dev/null |
    jq -r "[.Snapshots[] | [.SnapshotId, (.VolumeSize | tostring) + \" GB\", .StartTime, (.Description // \"\" | gsub(\"[|\\t]\"; \" \")), $TAGS]] | .[] | @tsv" 2>/dev/null |
    while IFS=$'\t' read -r id size started desc tags; do
      age=$(age_days "$started")
      note=""
      if echo " $AMI_SNAPS " | grep -q " $id "; then note="used by an AMI"
      elif echo "$desc" | grep -qE "AWS Backup|Created by CreateImage|rds:"; then note=""
      elif [ "$age" -gt "$OLD_SNAPSHOT_DAYS" ]; then note="FLAG older than ${OLD_SNAPSHOT_DAYS} d, no AMI uses it"; fi
      echo "| $id | $size | ${started%%T*} | ${age} d | ${tags:--} | ${note:--} |"
    done | { echo "| Id | Size | Started | Age | Tags | Notes |"; echo "|---|---|---|---|---|---|"; cat; echo; }
  $A ec2 describe-images --owners self --output json 2>/dev/null |
    jq "[.Images[] | [.ImageId, .Name, (.CreationDate | split(\"T\")[0]), $TAGS]] | .[]" |
    jq -s '.' | rows "AMI | Name | Created | Tags" '.[]'

  echo "## NAT gateways ($R)"
  echo
  $A ec2 describe-nat-gateways --filter Name=state,Values=available --output json 2>/dev/null | jq -r '.NatGateways[]?.NatGatewayId' |
    while read -r ngw; do
      gb=$($A cloudwatch get-metric-statistics --namespace AWS/NATGateway --metric-name BytesOutToDestination \
        --dimensions "Name=NatGatewayId,Value=$ngw" --start-time "$SINCE_ISO" --end-time "$NOW_ISO" \
        --period 604800 --statistics Sum --query 'sum(Datapoints[].Sum)' --output text 2>/dev/null)
      gb=$(awk "BEGIN{printf \"%.2f\", ${gb:-0}/1073741824}" 2>/dev/null || echo "?")
      note=""
      awk "BEGIN{exit !($gb < 1)}" 2>/dev/null && note="FLAG under 1 GB out in ${IDLE_DAYS} days (the gateway itself costs about 32 USD a month)"
      echo "| $ngw | $gb | $note |"
    done | { echo "| NAT gateway | GB out, last ${IDLE_DAYS} d | Notes |"; echo "|---|---|---|"; cat; echo; }

  echo "## Load balancers ($R)"
  echo
  $A elbv2 describe-load-balancers --output json 2>/dev/null | jq -r '.LoadBalancers[]? | [.LoadBalancerArn, .LoadBalancerName, .Type, (.CreatedTime | split("T")[0])] | @tsv' |
    while IFS=$'\t' read -r arn name type created; do
      healthy=0
      total=0
      for tg in $($A elbv2 describe-target-groups --load-balancer-arn "$arn" --query 'TargetGroups[].TargetGroupArn' --output text 2>/dev/null); do
        h=$($A elbv2 describe-target-health --target-group-arn "$tg" --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" --output text 2>/dev/null || echo 0)
        healthy=$((healthy + ${h:-0}))
        total=$((total + 1))
      done
      note=""
      [ "$healthy" = "0" ] && note="FLAG no healthy targets"
      echo "| $name | $type | $created | $healthy | $note |"
    done | { echo "| Name | Type | Created | Healthy targets | Notes |"; echo "|---|---|---|---|---|"; cat; echo; }

  echo "## ECS ($R)"
  echo
  for c in $($A ecs list-clusters --query 'clusterArns[]' --output text 2>/dev/null); do
    cn=${c##*/}
    $A ecs describe-clusters --clusters "$c" --query 'clusters[0].[clusterName,runningTasksCount,activeServicesCount]' --output text 2>/dev/null |
      awk -v s="$cn" '{n=""; if (s ~ /staging/ && ($2 > 0 || $3 > 0)) n="FLAG staging environment is running"; print "| " $1 " | " $2 " | " $3 " | " n " |"}'
  done | { echo "| Cluster | Running tasks | Services | Notes |"; echo "|---|---|---|---|"; cat; echo; }

  echo "## ECR repositories ($R)"
  echo
  # Repositories no ACTIVE task definition refers to.
  REFS=$(for td in $($A ecs list-task-definitions --status ACTIVE --query 'taskDefinitionArns[]' --output text 2>/dev/null); do
    $A ecs describe-task-definition --task-definition "$td" --query 'taskDefinition.containerDefinitions[].image' --output text 2>/dev/null
  done | tr '\t' '\n' | sort -u)
  $A ecr describe-repositories --output json 2>/dev/null | jq -r '.repositories[]? | .repositoryName' | while read -r repo; do
    n=$($A ecr describe-images --repository-name "$repo" --query 'length(imageDetails)' --output text 2>/dev/null || echo "?")
    gb=$($A ecr describe-images --repository-name "$repo" --query 'sum(imageDetails[].imageSizeInBytes)' --output text 2>/dev/null)
    gb=$(awk "BEGIN{printf \"%.2f\", ${gb:-0}/1073741824}" 2>/dev/null || echo "?")
    untag=$($A ecr describe-images --repository-name "$repo" --query 'length(imageDetails[?imageTags==null])' --output text 2>/dev/null || echo "?")
    lc=$($A ecr get-lifecycle-policy --repository-name "$repo" --query lifecyclePolicyText --output text 2>/dev/null | head -c1)
    note=""
    echo "$REFS" | grep -q "/$repo[:@]" || note="$note FLAG no active task definition uses it;"
    [ -z "$lc" ] && note="$note FLAG no lifecycle policy;"
    [ "$untag" != "0" ] && [ "$untag" != "?" ] && note="$note $untag untagged images;"
    echo "| $repo | $n | $gb | ${note:--} |"
  done | { echo "| Repository | Images | GB | Notes |"; echo "|---|---|---|---|"; cat; echo; }

  echo "## RDS ($R)"
  echo
  $A rds describe-db-instances --output json 2>/dev/null | jq -r '.DBInstances[]? | [.DBInstanceIdentifier, .DBInstanceClass, .DBInstanceStatus, (.AllocatedStorage | tostring), (.MultiAZ | tostring), (.BackupRetentionPeriod | tostring)] | @tsv' |
    while IFS=$'\t' read -r id cls st gb maz ret; do
      cpu=$($A cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name CPUUtilization --dimensions "Name=DBInstanceIdentifier,Value=$id" \
        --start-time "$SINCE_ISO" --end-time "$NOW_ISO" --period 604800 --statistics Average --query 'Datapoints[0].Average' --output text 2>/dev/null)
      conn=$($A cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name DatabaseConnections --dimensions "Name=DBInstanceIdentifier,Value=$id" \
        --start-time "$SINCE_ISO" --end-time "$NOW_ISO" --period 604800 --statistics Maximum --query 'Datapoints[0].Maximum' --output text 2>/dev/null)
      note=""
      [ "$conn" = "0.0" ] || [ "$conn" = "0" ] && note="$note FLAG no connections in ${IDLE_DAYS} d;"
      [ "$st" = "stopped" ] && note="$note FLAG stopped (AWS restarts it after 7 days);"
      case "$id" in *staging*) note="$note FLAG staging database exists;" ;; esac
      echo "| $id | $cls | $st | $gb | $maz | $ret | ${cpu:--} | ${conn:--} | ${note:--} |"
    done | { echo "| Instance | Class | Status | GB | Multi-AZ | Backup days | CPU % avg 7 d | Max connections 7 d | Notes |"; echo "|---|---|---|---|---|---|---|---|---|"; cat; echo; }
  echo "Manual RDS snapshots (automated ones expire by themselves):"
  echo
  $A rds describe-db-snapshots --snapshot-type manual --output json 2>/dev/null |
    jq '[.DBSnapshots[]? | [.DBSnapshotIdentifier, .DBInstanceIdentifier, (.SnapshotCreateTime | split("T")[0]), (.AllocatedStorage | tostring) + " GB"]] | .[]' |
    jq -s '.' | rows "Snapshot | Instance | Created | Size" '.[]'

  echo "## ElastiCache ($R)"
  echo
  $A elasticache describe-cache-clusters --output json 2>/dev/null | jq -r '.CacheClusters[]? | [.CacheClusterId, .CacheNodeType, .CacheClusterStatus, .Engine] | @tsv' |
    while IFS=$'\t' read -r id nt st eng; do
      cpu=$($A cloudwatch get-metric-statistics --namespace AWS/ElastiCache --metric-name CPUUtilization --dimensions "Name=CacheClusterId,Value=$id" \
        --start-time "$SINCE_ISO" --end-time "$NOW_ISO" --period 604800 --statistics Average --query 'Datapoints[0].Average' --output text 2>/dev/null)
      note=""
      awk "BEGIN{exit !(${cpu:-100} < 1)}" 2>/dev/null && note="FLAG CPU under 1 % for ${IDLE_DAYS} days"
      case "$id" in *staging*) note="$note FLAG staging cache exists;" ;; esac
      echo "| $id | $nt | $st | $eng | ${cpu:--} | ${note:--} |"
    done | { echo "| Cluster | Node type | Status | Engine | CPU % avg 7 d | Notes |"; echo "|---|---|---|---|---|---|"; cat; echo; }

  echo "## CloudWatch log groups ($R)"
  echo
  $A logs describe-log-groups --output json 2>/dev/null |
    jq '[.logGroups[]? | [.logGroupName, ((.retentionInDays // "never") | tostring), (((.storedBytes // 0) / 1048576 | floor | tostring) + " MB"),
         (if .retentionInDays == null then "FLAG no retention" else "" end)]] | sort_by(.[3]) | reverse | .[]' |
    jq -s '.' | rows "Log group | Retention days | Stored | Notes" '.[]'

  echo "## Resources tagged lawbid-loadtest ($R)"
  echo
  $A resourcegroupstaggingapi get-resources --tag-filters Key=lawbid-loadtest --output json 2>/dev/null |
    jq '[.ResourceTagMappingList[]? | [.ResourceARN, "FLAG load-test leftover"]] | .[]' | jq -s '.' | rows "ARN | Notes" '.[]'

  echo "## Resources with no tags at all ($R)"
  echo
  echo "(The tagging API only lists resource types it supports; the first 100 are shown.)"
  echo
  $A resourcegroupstaggingapi get-resources --output json 2>/dev/null |
    jq '[.ResourceTagMappingList[]? | select((.Tags | length) == 0) | [.ResourceARN]] | .[:100] | .[]' | jq -s '.' | rows "ARN" '.[]'
done
