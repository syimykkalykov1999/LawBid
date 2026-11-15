#!/usr/bin/env bash
# PostgreSQL major upgrade by AWS RDS Blue/Green (owner 15.11 «делай обновы
# сейчас», admin switch aws.postgres_major, docs/runbooks/db-major-upgrade.md).
#
# The commands are the ones of the AWS user guide, as they are there:
#   «Creating a blue/green deployment» (aws rds create-blue-green-deployment
#     --source <arn> --target-engine-version --target-db-parameter-group-name),
#   «Switching a blue/green deployment» (aws rds switchover-blue-green-deployment
#     --switchover-timeout; guardrails stop it and roll back when not safe),
#   «Preparing … with logical replication» (rds.logical_replication = 1 and the
#     instance in sync with its parameter group = one reboot).
# Why not `blue_green_update` of the Terraform AWS provider (6.72): it cannot
# be used with read replicas (provider docs, «Low-Downtime Updates»; prod has
# lawbid-prod-postgres-replica-1) and after the switchover it DELETES the old
# server with SkipFinalSnapshot=true (internal/service/rds/instance.go
# v6.72.0, «Deleting Blue/Green Deployment source»): no way back. Here the
# old 16 server stays as «<id>-old1» (read-only) until the owner deletes it.
#
# Idempotent: run again, it continues where it stopped (reboot done, the
# deployment exists, already switched). Nothing happens when the server
# already runs the asked major. A downgrade is refused.
#
# After the switchover RDS renames the green copies to the old names, but
# they are NEW instances (new DbiResourceId). The AWS provider finds a
# database by that id, so the state would point at «…-old1» and the next plan
# would rename it back. Fixed here the documented Terraform way: `terraform
# state rm` + `terraform import <address> <identifier>` for the primary and
# each read copy (run from infra/envs/prod after `terraform init`).
#
# Usage: rds-major-upgrade.sh <phase> <target-major>
#   phase prepare    reboot for logical replication, create the deployment,
#                    wait (at most WAIT_MINUTES) until the green copy is ready
#   phase switchover wait until ready, switch over, fix the Terraform state
# Env: AWS credentials + AWS_REGION; DB_ID (default lawbid-prod-postgres);
#      WAIT_MINUTES (default 50); SWITCHOVER_TIMEOUT (default 300, AWS default);
#      TF_DIR (default infra/envs/prod); DRY_RUN=1 prints the AWS writes only.
set -euo pipefail

PHASE="${1:?phase: prepare | switchover}"
TARGET="${2:?target major, e.g. 18}"
DB_ID="${DB_ID:-lawbid-prod-postgres}"
WAIT_MINUTES="${WAIT_MINUTES:-50}"
SWITCHOVER_TIMEOUT="${SWITCHOVER_TIMEOUT:-300}"
TF_DIR="${TF_DIR:-infra/envs/prod}"
PG_TARGET_GROUP="${DB_ID}${TARGET}"   # lawbid-prod-postgres18 (modules/postgres)
BGD_NAME="${DB_ID}-pg${TARGET}"

log() { echo "rds-major-upgrade: $*"; }
write() { if [ "${DRY_RUN:-0}" = "1" ]; then log "DRY_RUN: $*"; else "$@"; fi; }
rds() { aws rds "$@" --output text; }

case "$TARGET" in ''|*[!0-9]*) log "target must be a number"; exit 2 ;; esac

running=$(rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].EngineVersion')
arn=$(rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].DBInstanceArn')
running_major=${running%%.*}
log "$DB_ID runs $running, asked $TARGET"

# The deployment of this source that is not finished yet (or none).
bgd_id() {
  aws rds describe-blue-green-deployments --filters "Name=source,Values=$arn" \
    --query "BlueGreenDeployments[?Status!='SWITCHOVER_COMPLETED' && Status!='DELETING'].BlueGreenDeploymentIdentifier | [0]" \
    --output text | sed 's/^None$//'
}
bgd_status() { rds describe-blue-green-deployments --blue-green-deployment-identifier "$1" --query 'BlueGreenDeployments[0].Status'; }

if [ "$running_major" -ge "$TARGET" ] && [ -z "$(bgd_id)" ]; then
  if [ "$running_major" -gt "$TARGET" ]; then
    log "refused: $DB_ID already runs $running; a major downgrade is not possible (rollback = the kept «${DB_ID}-old1», runbook)"
    exit 1
  fi
  if [ "$PHASE" = "switchover" ]; then
    # A switchover that completed in an earlier run: make sure the state is right.
    :
  else
    log "nothing to do"
    exit 0
  fi
fi

wait_available() {
  local id=$1 deadline=$(( $(date +%s) + WAIT_MINUTES * 60 ))
  while :; do
    st=$(bgd_status "$id")
    log "deployment $id: $st"
    case "$st" in
      AVAILABLE) return 0 ;;
      PROVISIONING) ;;
      *) log "stopped in state $st (AWS console → RDS → Databases shows why; runbook «Если не получилось»)"; return 1 ;;
    esac
    [ "$(date +%s)" -lt "$deadline" ] || { log "not ready in $WAIT_MINUTES min; run again (continues)"; return 3; }
    sleep 30
  done
}

if [ "$PHASE" = "prepare" ]; then
  # 1. Logical replication on the blue side needs the instance in sync with its group.
  apply_status=$(rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].DBParameterGroups[0].ParameterApplyStatus')
  group=$(rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].DBParameterGroups[0].DBParameterGroupName')
  # 15.11 (KNOWN_ERRORS 171): right after the Terraform apply the new value
  # is not visible yet (prod: checked 5 s after the apply, «not 1»; a minute
  # later it read 1, pending-reboot). Wait up to 5 minutes for it.
  lr=""
  for _ in $(seq 1 30); do
    # `--source user`: our own values only, one page. Without it the CLI pages
    # through ~400 defaults and applies `| [0]` per page («None None None 1
    # None» on prod) — the real cause of KNOWN_ERRORS 171.
    lr=$(rds describe-db-parameters --db-parameter-group-name "$group" --source user --query "Parameters[?ParameterName=='rds.logical_replication'].ParameterValue")
    [ "$lr" = "1" ] && break
    [ "${DRY_RUN:-0}" = "1" ] && break
    sleep 10
  done
  if [ "$lr" != "1" ]; then
    log "rds.logical_replication is not 1 on $group (the Terraform apply sets it); stop"
    exit 1
  fi
  if [ "$apply_status" = "pending-reboot" ]; then
    log "reboot $DB_ID so rds.logical_replication = 1 takes effect (about a minute without the database)"
    write aws rds reboot-db-instance --db-instance-identifier "$DB_ID" > /dev/null
    [ "${DRY_RUN:-0}" = "1" ] || aws rds wait db-instance-available --db-instance-identifier "$DB_ID"
  fi
  # 2. The newest minor of the asked major that RDS allows from the running version.
  version=$(aws rds describe-db-engine-versions --engine postgres --engine-version "$running" \
    --query "DBEngineVersions[0].ValidUpgradeTarget[?starts_with(EngineVersion, '${TARGET}.')].EngineVersion" \
    --output text | tr '\t' '\n' | sort -V | tail -1)
  [ -n "$version" ] || { log "RDS offers no $TARGET.x upgrade from $running"; exit 1; }
  # 3. The deployment (one per source).
  id=$(bgd_id)
  if [ -z "$id" ]; then
    log "create-blue-green-deployment $BGD_NAME: $running -> $version on $PG_TARGET_GROUP"
    if [ "${DRY_RUN:-0}" = "1" ]; then
      log "DRY_RUN: aws rds create-blue-green-deployment --blue-green-deployment-name $BGD_NAME --source $arn --target-engine-version $version --target-db-parameter-group-name $PG_TARGET_GROUP"
      exit 0
    fi
    id=$(aws rds create-blue-green-deployment \
      --blue-green-deployment-name "$BGD_NAME" \
      --source "$arn" \
      --target-engine-version "$version" \
      --target-db-parameter-group-name "$PG_TARGET_GROUP" \
      --query 'BlueGreenDeployment.BlueGreenDeploymentIdentifier' --output text)
  fi
  wait_available "$id"
  exit $?
fi

if [ "$PHASE" = "switchover" ]; then
  id=$(bgd_id)
  if [ -n "$id" ]; then
    wait_available "$id"
    log "switchover $id (timeout $SWITCHOVER_TIMEOUT s): writes stop, connections drop, about a minute"
    write aws rds switchover-blue-green-deployment \
      --blue-green-deployment-identifier "$id" \
      --switchover-timeout "$SWITCHOVER_TIMEOUT" > /dev/null
    [ "${DRY_RUN:-0}" = "1" ] && exit 0
    while :; do
      st=$(bgd_status "$id")
      log "deployment $id: $st"
      case "$st" in
        SWITCHOVER_COMPLETED) break ;;
        SWITCHOVER_IN_PROGRESS|AVAILABLE) sleep 10 ;;
        *) log "switchover ended in $st: AWS rolled back, nothing changed (runbook «Если не получилось»)"; exit 1 ;;
      esac
    done
  fi
  # The Terraform state follows the new servers (same names, new ids).
  running=$(rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].EngineVersion')
  [ "${running%%.*}" = "$TARGET" ] || { log "$DB_ID runs $running after the switchover?"; exit 1; }
  new_dbi=$(rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].DbiResourceId')
  cd "$TF_DIR"
  reimport() {
    local addr=$1 ident=$2 want
    want=$(rds describe-db-instances --db-instance-identifier "$ident" --query 'DBInstances[0].DbiResourceId')
    have=$(terraform state show -no-color "$addr" 2>/dev/null | sed -n 's/^ *id *= *"\(.*\)"$/\1/p' | head -1)
    if [ "$have" = "$want" ]; then log "state of $addr already on $want"; return 0; fi
    log "state $addr: $have -> $want ($ident)"
    write terraform state rm -lock-timeout=5m "$addr" > /dev/null
    write terraform import -input=false -lock-timeout=5m "$addr" "$ident" > /dev/null
  }
  reimport 'module.stack.module.postgres[0].aws_db_instance.this' "$DB_ID"
  for addr in $(terraform state list | grep -E '^module\.stack\.module\.growth(\[0\])?\.aws_db_instance\.replica\[[0-9]+\]$' || true); do
    n=$(echo "$addr" | sed -E 's/.*\[([0-9]+)\]$/\1/')
    reimport "$addr" "${DB_ID}-replica-$(( n + 1 ))"
  done
  log "done: $DB_ID on $running ($new_dbi); the old server is ${DB_ID}-old1 (read-only, billed until deleted)"
fi
