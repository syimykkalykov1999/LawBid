#!/usr/bin/env sh
# docs/06 §7.3: `prisma migrate deploy` as a one-off ECS task (task
# definition `<cluster>-migrate`, DATABASE_URL = lawbid_migrator secret),
# before the services roll. Fails the pipeline unless the task exits 0.
set -eu
CLUSTER="$1"
SUBNETS=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${CLUSTER}-private-*" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${CLUSTER}-tasks" --query 'SecurityGroups[0].GroupId' --output text)
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "${CLUSTER}-migrate" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "migrate task: $TASK_ARN"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"
EXIT=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].containers[0].exitCode' --output text)
echo "migrate exit code: $EXIT"
aws logs tail "/lawbid/${CLUSTER}/migrate" --since 15m || true
[ "$EXIT" = "0" ]
