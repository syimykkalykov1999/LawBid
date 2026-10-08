#!/usr/bin/env bash
# Pre-launch wipe, Redis part (docs/runbooks/prelaunch-wipe.md). The prod
# Redis is reachable only inside the VPC, so this runs
# `node dist/scripts/prelaunch-wipe.js --only=redis` as a one-off ECS task
# on the worker task definition (it already has REDIS_URL and
# DATABASE_URL), the same way run-migrations.sh runs the migrate task.
#   prod-wipe-redis.sh            dry run: prints key counts per prefix
#   prod-wipe-redis.sh --execute  deletes; needs PRELAUNCH_WIPE_CONFIRM and
#                                 asks for the database name
set -euo pipefail
CLUSTER="${CLUSTER:-lawbid-prod}"
TASK_DEF="${CLUSTER}-worker"
CMD='"node","dist/scripts/prelaunch-wipe.js","--only=redis"'
ENVJSON='[]'
if [ "${1:-}" = "--execute" ]; then
  : "${PRELAUNCH_WIPE_CONFIRM:?set PRELAUNCH_WIPE_CONFIRM (see the runbook)}"
  read -rp "Имя базы данных (как в пробном прогоне): " DBNAME
  CMD="${CMD},\"--execute\""
  ENVJSON="[{\"name\":\"PRELAUNCH_WIPE_CONFIRM\",\"value\":\"${PRELAUNCH_WIPE_CONFIRM}\"},{\"name\":\"PRELAUNCH_WIPE_DB_NAME\",\"value\":\"${DBNAME}\"}]"
fi
OVERRIDES="{\"containerOverrides\":[{\"name\":\"worker\",\"command\":[${CMD}],\"environment\":${ENVJSON}}]}"

SUBNETS=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${CLUSTER}-private-*" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${CLUSTER}-tasks" --query 'SecurityGroups[0].GroupId' --output text)
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$TASK_DEF" \
  --overrides "$OVERRIDES" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "wipe task: $TASK_ARN (1–3 минуты)"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"
EXIT=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query "tasks[0].containers[?name=='worker'].exitCode | [0]" --output text)
aws logs get-log-events --log-group-name "/lawbid/${CLUSTER}/worker" \
  --log-stream-name "worker/worker/${TASK_ARN##*/}" --start-from-head \
  --query 'events[].message' --output text | tr '\t' '\n' || true
echo "exit code: $EXIT"
[ "$EXIT" = "0" ]
