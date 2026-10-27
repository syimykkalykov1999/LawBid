#!/usr/bin/env sh
# docs/06 §7.3: `prisma migrate deploy` as a one-off ECS task (task
# definition `<cluster>-migrate`, DATABASE_URL = lawbid_migrator secret),
# before the services roll. Fails the pipeline unless the task exits 0.
#
# With a TAG (second argument) the migrate task definition is first
# re-registered on that image, so the migrations of the release being
# deployed run — not those of the image Terraform last applied.
#
# S11-4: the wait has OUR deadline (MIGRATE_TIMEOUT_SECONDS, default 1800 =
# 30 min; the AWS CLI waiter gives up after 10 min while the task keeps
# running), a `failures[]` answer of run-task fails at once (no capacity),
# the task is stopped when the deadline passes or the job is cancelled (so a
# long index build never keeps holding locks behind a "red" deploy), a second
# migrate task is refused while one still runs, and the last 200 log lines are
# always printed. A half-applied migration: docs/runbooks/migrate-resolve.md.
set -eu
CLUSTER="$1"; TAG="${2:-}"
MIGRATE_TIMEOUT_SECONDS="${MIGRATE_TIMEOUT_SECONDS:-1800}"
TASK_DEF="${CLUSTER}-migrate"
if [ -n "$TAG" ]; then
  REGISTRY="${ECR_REGISTRY:?ECR_REGISTRY is required with a tag}"
  aws ecs describe-task-definition --task-definition "$TASK_DEF" --query 'taskDefinition' > migrate-td.json
  node -e '
    const fs = require("fs");
    const td = JSON.parse(fs.readFileSync("migrate-td.json", "utf8"));
    for (const c of td.containerDefinitions) {
      c.image = process.argv[1];
      // Online DDL (docs/architecture/ONLINE_DDL.md): after the transactional
      // migrations, run prisma/concurrent/*.sql (CREATE INDEX CONCURRENTLY).
      // Set here so it does not wait for a Terraform apply.
      // Deploy safety 2026-10-27: then the CI drift check against the REAL
      // database (prisma/verify-schema.mjs) — a guarded migration that
      // skipped its work stops the deploy before the new api starts.
      c.command = ["sh", "-c", "npx prisma migrate deploy && node prisma/run-concurrent.mjs && node prisma/verify-schema.mjs"];
      const mode = process.env.SCHEMA_DRIFT_CHECK || "fail";
      c.environment = (c.environment || []).filter((e) => e.name !== "SCHEMA_DRIFT_CHECK").concat([{ name: "SCHEMA_DRIFT_CHECK", value: mode }]);
    }
    for (const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"]) delete td[k];
    fs.writeFileSync("migrate-td.new.json", JSON.stringify(td));
  ' "${REGISTRY}/lawbid-api:${TAG}"
  TASK_DEF=$(aws ecs register-task-definition --cli-input-json file://migrate-td.new.json --query 'taskDefinition.taskDefinitionArn' --output text)
  echo "migrate task definition: $TASK_DEF"
fi
SUBNETS=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${CLUSTER}-private-*" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${CLUSTER}-tasks" --query 'SecurityGroups[0].GroupId' --output text)
# Never two migrations at once (a re-run clicked while the first still works).
RUNNING=$(aws ecs list-tasks --cluster "$CLUSTER" --family "${TASK_DEF##*/}" --desired-status RUNNING --query 'taskArns' --output text 2>/dev/null || true)
RUNNING=$(printf '%s' "${RUNNING:-}" | sed 's/^None$//')
if [ -n "$RUNNING" ]; then
  echo "::error::a migrate task is still running ($RUNNING). Wait for it or stop it (docs/runbooks/migrate-resolve.md)." >&2
  exit 1
fi
# One guarded run of the migrate task (start failures, deadline, cancel).
# Sets EXIT and LOGS.
run_once() {
  RUN_OUT=$(aws ecs run-task \
    --cluster "$CLUSTER" \
    --launch-type FARGATE \
    --task-definition "$TASK_DEF" \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
    --output json)
  FAILS=$(printf '%s' "$RUN_OUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log((j.failures||[]).map(f=>f.reason||f.detail||f.arn).join("; "))})')
  TASK_ARN=$(printf '%s' "$RUN_OUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log((j.tasks||[])[0]?.taskArn||"")})')
  if [ -n "$FAILS" ] || [ -z "$TASK_ARN" ]; then
    echo "::error::the migrate task did not start: ${FAILS:-no task returned} (Fargate capacity or network). Nothing was migrated; re-run the deploy." >&2
    exit 1
  fi
  echo "migrate task: $TASK_ARN"
  LOG_STREAM_PREFIX="/lawbid/${CLUSTER}/migrate"

  stop_task() {
    aws ecs stop-task --cluster "$CLUSTER" --task "$TASK_ARN" --reason "$1" >/dev/null 2>&1 || true
  }
  # Job cancelled (GitHub sends SIGINT, then SIGTERM): stop the task, do not leave it holding locks.
  trap 'echo "::warning::cancelled, stopping the migrate task"; stop_task "deploy cancelled"; exit 130' INT TERM

  start=$(date +%s)
  while :; do
    STATUS=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].lastStatus' --output text 2>/dev/null || echo UNKNOWN)
    [ "$STATUS" = "STOPPED" ] && break
    if [ $(( $(date +%s) - start )) -ge "$MIGRATE_TIMEOUT_SECONDS" ]; then
      echo "::error::the migration ran longer than ${MIGRATE_TIMEOUT_SECONDS}s: stopping it. Check _prisma_migrations for a half-applied row (docs/runbooks/migrate-resolve.md)." >&2
      stop_task "deadline ${MIGRATE_TIMEOUT_SECONDS}s"
      aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN" 2>/dev/null || true
      aws logs tail "$LOG_STREAM_PREFIX" --since 2h 2>/dev/null | tail -n 200 || true
      exit 1
    fi
    sleep 10
  done
  trap - INT TERM
  EXIT=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].containers[0].exitCode' --output text)
  REASON=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].stoppedReason' --output text 2>/dev/null || true)
  echo "migrate exit code: $EXIT ($REASON)"
  LOGS=$(aws logs tail "$LOG_STREAM_PREFIX" --since 15m 2>/dev/null | tail -n 200 || true)
  printf '%s\n' "$LOGS"
}

run_once
# DB-ops S5-2 (#363): the migrator role has lock_timeout = 5 s. A migration
# that lost the race for a lock fails with SQLSTATE 55P03 and changed nothing
# (each migration is one transaction): run the task once more after a pause.
if [ "$EXIT" != "0" ] && printf '%s' "$LOGS" | grep -Eqi '55P03|lock timeout'; then
  echo "migration hit lock_timeout (55P03); retrying once in 20 s"
  sleep 20
  run_once
fi
if [ "$EXIT" != "0" ]; then
  echo "::error::migration failed (exit $EXIT). If the log says P3009 / 'failed migrations': docs/runbooks/migrate-resolve.md" >&2
  exit 1
fi
