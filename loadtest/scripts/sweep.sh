#!/usr/bin/env bash
# LAST RESORT (used by the watchdog when Terraform could not destroy a stale
# stack, e.g. its state is gone): deletes the resources that cost money while
# they run - EC2 boxes, ECS services, RDS, Redis, load balancers, NAT gateways,
# Elastic IPs - found by the tag Project=lawbid-loadtest [and RunId].
# Everything else tagged (VPC, subnets, security groups, buckets...) is only
# listed: it costs (almost) nothing and Terraform or the owner removes it.
#   sweep.sh [RunId]       (no RunId = everything tagged lawbid-loadtest)
set -uo pipefail
run="${1:-}"
r="${AWS_REGION:-us-east-1}"
filters=(Key=Project,Values=lawbid-loadtest)
[ -n "$run" ] && filters+=(Key=RunId,Values="$run")
arns="$(aws resourcegroupstaggingapi get-resources --region "$r" --tag-filters "${filters[@]}" --query 'ResourceTagMappingList[].ResourceARN' --output text | tr '\t' '\n' | sed '/^$/d')"
echo "[sweep] tagged resources found: $(grep -c . <<<"$arns")"
act() { echo "[sweep] $*"; "$@" >/dev/null 2>&1 || echo "[sweep]   (failed, continues)"; }

# 1. compute first (stops the meter), then data stores, then network pieces
while read -r a; do
  case "$a" in
    arn:aws:ec2:*:instance/*) act aws ec2 terminate-instances --region "$r" --instance-ids "${a##*/}";;
    arn:aws:ecs:*:service/*)
      cl="$(cut -d/ -f2 <<<"$a")"; sv="$(cut -d/ -f3 <<<"$a")"
      act aws ecs update-service --region "$r" --cluster "$cl" --service "$sv" --desired-count 0
      act aws ecs delete-service --region "$r" --cluster "$cl" --service "$sv" --force;;
  esac
done <<<"$arns"
while read -r a; do
  case "$a" in
    arn:aws:rds:*:db:*) act aws rds modify-db-instance --region "$r" --db-instance-identifier "${a##*:}" --no-deletion-protection --apply-immediately
                       act aws rds delete-db-instance --region "$r" --db-instance-identifier "${a##*:}" --skip-final-snapshot --delete-automated-backups;;
    arn:aws:elasticache:*:replicationgroup:*) act aws elasticache delete-replication-group --region "$r" --replication-group-id "${a##*:}";;
    arn:aws:elasticloadbalancing:*:loadbalancer/*) act aws elbv2 delete-load-balancer --region "$r" --load-balancer-arn "$a";;
    arn:aws:ec2:*:natgateway/*) act aws ec2 delete-nat-gateway --region "$r" --nat-gateway-id "${a##*/}";;
  esac
done <<<"$arns"
sleep 60
while read -r a; do
  case "$a" in
    arn:aws:ec2:*:elastic-ip/*) act aws ec2 release-address --region "$r" --allocation-id "${a##*/}";;
  esac
done <<<"$arns"
echo "[sweep] done. Remaining tagged items (Terraform destroy or the owner removes them): run verify-clean.sh"
