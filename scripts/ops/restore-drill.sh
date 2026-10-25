#!/usr/bin/env bash
# Restore drill (docs/runbooks/restore-drill.md; Well-Architected REL09 BP4
# "perform periodic recovery of the data to verify backup integrity").
# Owner 2026-10-22: fully scripted, nothing to click.
#
#   scripts/ops/restore-drill.sh                     # prod defaults
#   DB_ID=lawbid-prod-postgres CLUSTER=lawbid-prod MODE=pitr scripts/ops/restore-drill.sh
#   MODE=backup-vault scripts/ops/restore-drill.sh   # AWS Backup recovery point (what we claim to have)
#   MODE=backup-vault DR=1 DR_SUBNET_GROUP=… scripts/ops/restore-drill.sh   # the copy in us-west-2
#   FAILOVER=1 HEALTH_URL=https://… scripts/ops/restore-drill.sh   # RDS Multi-AZ reboot with failover
#   DB_ID=lawbid-staging-postgres CLUSTER=lawbid-staging …   # same, in staging / loadtest
#
# What it does, from the owner's Mac with the AWS CLI logged in:
#   1. finds the newest automated snapshot of $DB_ID (MODE=snapshot, default)
#      or uses the latest restorable second (MODE=pitr);
#   2. restores it into a NEW temporary instance `lawbid-drill-<date>`
#      (same subnet group and security groups, db.t4g.micro, single-AZ,
#      not public) — the live database is never touched;
#   3. sets a fresh random master password on the copy;
#   4. runs a smoke query against the copy from inside the VPC: a one-off
#      ECS task from the existing `migrate` task definition (the API image,
#      Prisma) — row counts of the main tables and the newest row;
#   5. DELETES the temporary instance (also on error or Ctrl-C), no final
#      snapshot;
#   6. prints the row for the log table in docs/runbooks/restore-drill.md
#      (RTO = start → smoke ok, RPO = age of the restored data).
# Cost: one db.t4g.micro for ~30–60 minutes ≈ $0.05 plus a few cents of
# Fargate. KEEP=1 leaves the copy running (delete it by hand afterwards).
#
# MODE=backup-vault (Batch A item 2): the restore comes from the newest
# COMPLETED recovery point of the AWS Backup vault `${CLUSTER}-db`
# (`aws backup start-restore-job`), not from an RDS automated snapshot. With
# DR=1 it comes from the copy in the second region (vault `${CLUSTER}-db-dr`,
# DR_REGION, default us-west-2): that region has no VPC of ours, so give
# DR_SUBNET_GROUP (and DR_SG_IDS); there is no ECS to run the smoke query
# there, so the drill proves "the copy restores to an available instance"
# and stops (RTO to `available`).
#
# FAILOVER=1 (separate test, touches the LIVE instance of $DB_ID): needs
# Multi-AZ, HEALTH_URL (an HTTP URL that reads the database, e.g.
# https://api.lawbid.dev/health/ready) and CONFIRM_OUTAGE=yes. Runs
# `aws rds reboot-db-instance --force-failover`, polls HEALTH_URL every
# second and prints the outage seconds + the failed requests. AWS: a reboot
# with failover simulates a failure, DNS flips, connections must reconnect,
# an outage still happens. Run it OFF-PEAK, in staging / loadtest first.
# Prod additionally needs ALLOW_PROD=1.
#
# Optional deep check: RESTORED_URL + PROD_URL (both reachable from here)
# compare migrations and row counts copy vs production (old manual mode).
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
DB_ID="${DB_ID:-lawbid-prod-postgres}"
CLUSTER="${CLUSTER:-lawbid-prod}"
MODE="${MODE:-snapshot}"
DR="${DR:-0}"
DR_REGION="${DR_REGION:-us-west-2}"
VAULT="${VAULT:-${CLUSTER}-db}"
BACKUP_ROLE="${BACKUP_ROLE:-${CLUSTER}-backup}"
CLASS="${DRILL_CLASS:-db.t4g.micro}"
DRILL_ID="${DRILL_ID:-lawbid-drill-$(date -u +%Y%m%d-%H%M)}"
AWS=(aws --region "$REGION")
START=$(date +%s)
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# ---------------------------------------------------------------- deep check
if [ -n "${RESTORED_URL:-}" ] && [ -n "${PROD_URL:-}" ]; then
  q() { psql "$1" -At -v ON_ERROR_STOP=1 -c "$2"; }
  q "$RESTORED_URL" "SELECT 1" >/dev/null
  want=$(ls -d apps/api/prisma/migrations/2* | wc -l | tr -d ' ')
  have=$(q "$RESTORED_URL" "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
  echo "migrations: code $want, restored $have"
  [ "$have" -le "$want" ] && [ "$have" -ge $((want - 5)) ] || { echo "migrations differ too much"; exit 1; }
  for t in users cases bids messages subscriptions case_journal; do
    a=$(q "$PROD_URL" "SELECT count(*) FROM $t"); b=$(q "$RESTORED_URL" "SELECT count(*) FROM $t")
    echo "$t: prod $a, restored $b"
    [ "$a" -eq 0 ] || [ "$((b * 100 / a))" -ge 90 ] || { echo "$t: restored has far fewer rows"; exit 1; }
  done
  echo "deep check OK"
  exit 0
fi

# ------------------------------------------------------------ failover test
if [ "${FAILOVER:-0}" = "1" ]; then
  command -v aws >/dev/null && command -v curl >/dev/null || { echo "aws and curl are required"; exit 1; }
  [ -n "${HEALTH_URL:-}" ] || { echo "set HEALTH_URL (an endpoint that reads the database)"; exit 1; }
  [ "${CONFIRM_OUTAGE:-}" = "yes" ] || { echo "this causes a real outage of about a minute: re-run with CONFIRM_OUTAGE=yes (off-peak)"; exit 1; }
  case "$DB_ID" in *prod*) [ "${ALLOW_PROD:-0}" = "1" ] || { echo "$DB_ID looks like production: run in staging / loadtest first, or ALLOW_PROD=1"; exit 1; } ;; esac
  read -r MAZ AZ_BEFORE < <("${AWS[@]}" rds describe-db-instances --db-instance-identifier "$DB_ID" \
    --query 'DBInstances[0].[MultiAZ, AvailabilityZone]' --output text)
  [ "$MAZ" = "True" ] || { echo "$DB_ID is not Multi-AZ: a failover test makes no sense (docs/runbooks/backups.md)"; exit 1; }
  PROBE=$(mktemp)
  ( while :; do
      code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$HEALTH_URL" || true)
      printf '%s %s\n' "$(date +%s)" "${code:-000}" >> "$PROBE"
      sleep 1
    done ) &
  PROBE_PID=$!
  trap 'kill $PROBE_PID 2>/dev/null || true; rm -f "$PROBE"' EXIT
  sleep 10
  log "failover: $DB_ID is in $AZ_BEFORE; rebooting with failover…"
  T0=$(date +%s)
  "${AWS[@]}" rds reboot-db-instance --db-instance-identifier "$DB_ID" --force-failover >/dev/null
  # Wait for the AZ to change and the instance to be available again.
  while :; do
    read -r ST AZ_NOW < <("${AWS[@]}" rds describe-db-instances --db-instance-identifier "$DB_ID" \
      --query 'DBInstances[0].[DBInstanceStatus, AvailabilityZone]' --output text)
    [ "$ST" = "available" ] && [ "$AZ_NOW" != "$AZ_BEFORE" ] && break
    [ $(( $(date +%s) - T0 )) -lt 900 ] || { echo "no failover finished in 15 min: check RDS events"; exit 1; }
    sleep 5
  done
  T_DB=$(date +%s)
  sleep 30   # let the app reconnect; the probe keeps counting
  kill $PROBE_PID 2>/dev/null || true
  FAILED=$(awk -v t0="$T0" '$1>=t0 && $2!~/^2/ {n++} END{print n+0}' "$PROBE")
  FIRST=$(awk -v t0="$T0" '$1>=t0 && $2!~/^2/ {print $1; exit}' "$PROBE")
  LAST=$(awk -v t0="$T0" '$1>=t0 && $2!~/^2/ {l=$1} END{print l}' "$PROBE")
  OUT=0; [ -n "$FIRST" ] && OUT=$(( LAST - FIRST + 1 ))
  log "failover OK: $AZ_BEFORE → $AZ_NOW, RDS available after $(( T_DB - T0 )) s; $FAILED failed probes, user-visible outage ≈ ${OUT} s."
  echo "Add to docs/runbooks/restore-drill.md (failover table):"
  echo "| $(date -u +%Y-%m-%d) | $DB_ID | $AZ_BEFORE → $AZ_NOW | $(( T_DB - T0 )) s | ${OUT} s | $FAILED | — | $(whoami) |"
  [ "$OUT" -le "${MAX_OUTAGE_SEC:-180}" ] || { echo "outage longer than ${MAX_OUTAGE_SEC:-180} s: check the pool / retry settings (docs/runbooks/DB_POOLER.md)"; exit 1; }
  exit 0
fi

# ------------------------------------------------------------ automated drill
command -v aws >/dev/null || { echo "aws CLI is required"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }

cleanup() {
  if [ "${KEEP:-0}" = "1" ]; then
    log "KEEP=1: $DRILL_ID is left running — delete it by hand: aws rds delete-db-instance --db-instance-identifier $DRILL_ID --skip-final-snapshot --delete-automated-backups"
    return
  fi
  if "${AWS[@]}" rds describe-db-instances --db-instance-identifier "$DRILL_ID" >/dev/null 2>&1; then
    log "deleting the temporary instance $DRILL_ID…"
    "${AWS[@]}" rds delete-db-instance --db-instance-identifier "$DRILL_ID" \
      --skip-final-snapshot --delete-automated-backups >/dev/null || true
    "${AWS[@]}" rds wait db-instance-deleted --db-instance-identifier "$DRILL_ID" || true
    log "deleted."
  fi
}
trap cleanup EXIT

if [ "$MODE" = "backup-vault" ] && [ "$DR" = "1" ]; then
  [ -n "${DR_SUBNET_GROUP:-}" ] || { echo "DR=1 needs DR_SUBNET_GROUP (a DB subnet group in $DR_REGION)"; exit 1; }
  VAULT="${VAULT_DR:-${CLUSTER}-db-dr}"
  AWS=(aws --region "$DR_REGION")
fi

log "1/6 source $DB_ID…"
read -r SUBNET_GROUP PARAM_GROUP SG_IDS < <(aws --region "$REGION" rds describe-db-instances --db-instance-identifier "$DB_ID" \
  --query 'DBInstances[0].[DBSubnetGroup.DBSubnetGroupName, DBParameterGroups[0].DBParameterGroupName, join(`,`, VpcSecurityGroups[].VpcSecurityGroupId)]' \
  --output text)
COMMON=(--db-instance-identifier "$DRILL_ID" --db-instance-class "$CLASS" --db-subnet-group-name "$SUBNET_GROUP"
  --db-parameter-group-name "$PARAM_GROUP" --vpc-security-group-ids ${SG_IDS//,/ }
  --no-multi-az --no-publicly-accessible --no-deletion-protection --tags Key=Purpose,Value=restore-drill)

if [ "$MODE" = "backup-vault" ]; then
  read -r RP BACKUP_TIME < <("${AWS[@]}" backup list-recovery-points-by-backup-vault --backup-vault-name "$VAULT" \
    --query 'reverse(sort_by(RecoveryPoints[?Status==`COMPLETED`], &CreationDate))[0].[RecoveryPointArn, CreationDate]' --output text)
  [ -n "$RP" ] && [ "$RP" != "None" ] || { echo "vault $VAULT has no COMPLETED recovery point yet (first run 06:00 UTC, or start one: docs/runbooks/restore-drill.md)"; exit 1; }
  ROLE_ARN=$(aws --region "$REGION" iam get-role --role-name "$BACKUP_ROLE" --query Role.Arn --output text)
  log "2/6 restore recovery point $RP ($BACKUP_TIME) from vault $VAULT → $DRILL_ID…"
  META=$(mktemp)
  "${AWS[@]}" backup get-recovery-point-restore-metadata --backup-vault-name "$VAULT" --recovery-point-arn "$RP" \
    --query RestoreMetadata --output json > "$META"
  # Start from what AWS Backup suggests, then force the drill settings.
  # Security groups are set after the restore (modify-db-instance below):
  # the list format of that key in the restore metadata is not documented.
  python3 - "$META" "$DRILL_ID" "$CLASS" "$([ "$DR" = "1" ] && echo "$DR_SUBNET_GROUP" || echo "$SUBNET_GROUP")" "-" "$([ "$DR" = "1" ] && echo "" || echo "$PARAM_GROUP")" <<'PY'
import json, sys
path, ident, cls, subnet, sgs, pg = sys.argv[1:7]
m = json.load(open(path))
m.update({"DBInstanceIdentifier": ident, "DBInstanceClass": cls, "DBSubnetGroupName": subnet,
          "MultiAZ": "false", "PubliclyAccessible": "false", "DeletionProtection": "false"})
if pg:
    m["DBParameterGroupName"] = pg
json.dump({k: str(v) for k, v in m.items()}, open(path, "w"))
PY
  RJOB=$("${AWS[@]}" backup start-restore-job --recovery-point-arn "$RP" --iam-role-arn "$ROLE_ARN" \
    --resource-type RDS --metadata "file://$META" --query RestoreJobId --output text)
  rm -f "$META"
  while :; do
    RST=$("${AWS[@]}" backup describe-restore-job --restore-job-id "$RJOB" --query Status --output text)
    case "$RST" in
      COMPLETED) break ;;
      ABORTED|FAILED) echo "restore job $RJOB ended $RST: $("${AWS[@]}" backup describe-restore-job --restore-job-id "$RJOB" --query StatusMessage --output text)"; exit 1 ;;
    esac
    sleep 30
  done
elif [ "$MODE" = "pitr" ]; then
  BACKUP_TIME=$("${AWS[@]}" rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].LatestRestorableTime' --output text)
  log "2/6 point-in-time restore to the latest restorable time ($BACKUP_TIME) → $DRILL_ID…"
  "${AWS[@]}" rds restore-db-instance-to-point-in-time --source-db-instance-identifier "$DB_ID" \
    --use-latest-restorable-time --target-db-instance-identifier "$DRILL_ID" \
    "${COMMON[@]:2}" >/dev/null
else
  read -r SNAP BACKUP_TIME < <("${AWS[@]}" rds describe-db-snapshots --db-instance-identifier "$DB_ID" --snapshot-type automated \
    --query 'reverse(sort_by(DBSnapshots[?Status==`available`], &SnapshotCreateTime))[0].[DBSnapshotIdentifier, SnapshotCreateTime]' \
    --output text)
  [ -n "$SNAP" ] && [ "$SNAP" != "None" ] || { echo "no automated snapshot of $DB_ID"; exit 1; }
  log "2/6 restore snapshot $SNAP ($BACKUP_TIME) → $DRILL_ID…"
  "${AWS[@]}" rds restore-db-instance-from-db-snapshot --db-snapshot-identifier "$SNAP" "${COMMON[@]}" >/dev/null
fi
"${AWS[@]}" rds wait db-instance-available --db-instance-identifier "$DRILL_ID"
if [ "$MODE" = "backup-vault" ]; then
  SGS_FIX="${DR_SG_IDS:-}"; [ "$DR" = "1" ] || SGS_FIX="${SG_IDS//,/ }"
  if [ -n "$SGS_FIX" ]; then
    "${AWS[@]}" rds modify-db-instance --db-instance-identifier "$DRILL_ID" --vpc-security-group-ids ${SGS_FIX//,/ } --apply-immediately >/dev/null
    sleep 30
    "${AWS[@]}" rds wait db-instance-available --db-instance-identifier "$DRILL_ID"
  fi
fi
RESTORED_AT=$(date +%s)
log "   available after $(( (RESTORED_AT - START) / 60 )) min."

if [ "$MODE" = "backup-vault" ] && [ "$DR" = "1" ]; then
  # No VPC / ECS of ours in the DR region: available = the copy restores.
  RTO_MIN=$(( ($(date +%s) - START) / 60 ))
  log "DR copy restored and available in $DR_REGION after ${RTO_MIN} min (no smoke query there). Deleting…"
  cleanup; trap - EXIT
  echo "| $(date -u +%Y-%m-%d) | backup-vault DR ($DR_REGION): $BACKUP_TIME | $DRILL_ID ($CLASS) | ${RTO_MIN} min | - | instance available | — | $(whoami) |"
  exit 0
fi

log "3/6 fresh master password on the copy…"
PASS=$(openssl rand -hex 24)
"${AWS[@]}" rds modify-db-instance --db-instance-identifier "$DRILL_ID" --master-user-password "$PASS" --apply-immediately >/dev/null
sleep 30
"${AWS[@]}" rds wait db-instance-available --db-instance-identifier "$DRILL_ID"
read -r HOST PORT USER DBNAME < <("${AWS[@]}" rds describe-db-instances --db-instance-identifier "$DRILL_ID" \
  --query 'DBInstances[0].[Endpoint.Address, Endpoint.Port, MasterUsername, DBName]' --output text)
[ "$DBNAME" != "None" ] || DBNAME=lawbid
URL="postgresql://${USER}:${PASS}@${HOST}:${PORT}/${DBNAME}?sslmode=require"

log "4/6 smoke query from inside the VPC (one-off ECS task)…"
NET=$("${AWS[@]}" ecs describe-services --cluster "$CLUSTER" --services api \
  --query 'services[0].networkConfiguration.awsvpcConfiguration' --output json)
SUBNETS=$(printf '%s' "$NET" | python3 -c 'import json,sys;print(",".join(json.load(sys.stdin)["subnets"]))')
TASK_SGS=$(printf '%s' "$NET" | python3 -c 'import json,sys;print(",".join(json.load(sys.stdin)["securityGroups"]))')
SMOKE='const{PrismaClient}=require("@prisma/client");const p=new PrismaClient({datasourceUrl:process.env.DRILL_URL});(async()=>{const r=await p.$queryRawUnsafe(`select (select count(*) from users)::int as users,(select count(*) from cases)::int as cases,(select count(*) from bids)::int as bids,(select count(*) from messages)::int as messages,(select count(*) from _prisma_migrations where finished_at is not null)::int as migrations,(select max(created_at) from users) as newest_user,(select max(created_at) from case_journal) as newest_journal`);console.log("DRILL_RESULT "+JSON.stringify(r[0]));await p.$disconnect()})().catch(e=>{console.error("DRILL_FAILED",e.message);process.exit(1)})'
OVERRIDES=$(DRILL_URL="$URL" SMOKE="$SMOKE" python3 -c 'import json,os;print(json.dumps({"containerOverrides":[{"name":"migrate","command":["node","-e",os.environ["SMOKE"]],"environment":[{"name":"DRILL_URL","value":os.environ["DRILL_URL"]}]}]}))')
TASK=$("${AWS[@]}" ecs run-task --cluster "$CLUSTER" --task-definition "${CLUSTER}-migrate" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$TASK_SGS],assignPublicIp=DISABLED}" \
  --overrides "$OVERRIDES" --query 'tasks[0].taskArn' --output text)
"${AWS[@]}" ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK"
EXIT=$("${AWS[@]}" ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)
RESULT=$("${AWS[@]}" logs get-log-events --log-group-name "/lawbid/${CLUSTER}/migrate" \
  --log-stream-name "migrate/migrate/${TASK##*/}" --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' | grep -E 'DRILL_(RESULT|FAILED)' || true)
echo "   $RESULT"
[ "$EXIT" = "0" ] && [[ "$RESULT" == DRILL_RESULT* ]] || { echo "smoke query FAILED (exit $EXIT)"; exit 1; }
SMOKE_OK=$(date +%s)

log "5/6 deleting the temporary instance (cleanup)…"
cleanup
trap - EXIT

NEWEST=$(printf '%s' "${RESULT#DRILL_RESULT }" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("newest_user") or "-")')
RTO_MIN=$(( (SMOKE_OK - START) / 60 ))
log "6/6 OK. RTO ${RTO_MIN} min. Add this row to docs/runbooks/restore-drill.md:"
echo "| $(date -u +%Y-%m-%d) | $MODE: $BACKUP_TIME | $DRILL_ID ($CLASS) | ${RTO_MIN} min | newest user row $NEWEST | rows ok, migrations ok | — | $(whoami) |"
