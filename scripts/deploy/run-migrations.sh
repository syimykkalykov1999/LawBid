#!/usr/bin/env sh
# docs/06 §7.3: `prisma migrate deploy` as a one-off ECS task (task
# definition `<cluster>-migrate`, DATABASE_URL = lawbid_migrator secret),
# before the services roll. Fails the pipeline unless the task exits 0.
#
# With a TAG (second argument) the migrate task definition is first
# re-registered on that image, so the migrations of the release being
# deployed run — not those of the image Terraform last applied.
set -eu
CLUSTER="$1"; TAG="${2:-}"
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
      c.command = ["sh", "-c", "npx prisma migrate deploy && node prisma/run-concurrent.mjs"];
    }
    for (const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"]) delete td[k];
    fs.writeFileSync("migrate-td.new.json", JSON.stringify(td));
  ' "${REGISTRY}/lawbid-api:${TAG}"
  TASK_DEF=$(aws ecs register-task-definition --cli-input-json file://migrate-td.new.json --query 'taskDefinition.taskDefinitionArn' --output text)
  echo "migrate task definition: $TASK_DEF"
fi
SUBNETS=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${CLUSTER}-private-*" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${CLUSTER}-tasks" --query 'SecurityGroups[0].GroupId' --output text)
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$TASK_DEF" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "migrate task: $TASK_ARN"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"
EXIT=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].containers[0].exitCode' --output text)
echo "migrate exit code: $EXIT"
aws logs tail "/lawbid/${CLUSTER}/migrate" --since 15m || true
[ "$EXIT" = "0" ]
