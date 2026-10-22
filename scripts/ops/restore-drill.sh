#!/usr/bin/env bash
# Restore drill (docs/runbooks/restore-drill.md; Well-Architected REL09 BP4
# "perform periodic recovery of the data to verify backup integrity").
# Owner 2026-10-22: fully scripted, nothing to click.
#
#   scripts/ops/restore-drill.sh                     # prod defaults
#   DB_ID=lawbid-prod-postgres CLUSTER=lawbid-prod MODE=pitr scripts/ops/restore-drill.sh
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
# Optional deep check: RESTORED_URL + PROD_URL (both reachable from here)
# compare migrations and row counts copy vs production (old manual mode).
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
DB_ID="${DB_ID:-lawbid-prod-postgres}"
CLUSTER="${CLUSTER:-lawbid-prod}"
MODE="${MODE:-snapshot}"
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

log "1/6 source $DB_ID…"
read -r SUBNET_GROUP PARAM_GROUP SG_IDS < <("${AWS[@]}" rds describe-db-instances --db-instance-identifier "$DB_ID" \
  --query 'DBInstances[0].[DBSubnetGroup.DBSubnetGroupName, DBParameterGroups[0].DBParameterGroupName, join(`,`, VpcSecurityGroups[].VpcSecurityGroupId)]' \
  --output text)
COMMON=(--db-instance-identifier "$DRILL_ID" --db-instance-class "$CLASS" --db-subnet-group-name "$SUBNET_GROUP"
  --db-parameter-group-name "$PARAM_GROUP" --vpc-security-group-ids ${SG_IDS//,/ }
  --no-multi-az --no-publicly-accessible --no-deletion-protection --tags Key=Purpose,Value=restore-drill)

if [ "$MODE" = "pitr" ]; then
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
RESTORED_AT=$(date +%s)
log "   available after $(( (RESTORED_AT - START) / 60 )) min."

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
