#!/usr/bin/env bash
# Owner 2026-10-16: the prod database is RDS PostgreSQL in our private
# subnets (the Mac cannot reach it), so every SQL step runs as a one-off
# ECS task of the API image inside the VPC. Run once from the Mac with AWS
# logged in (aws login):  scripts/deploy/prod-db-rds.sh <image tag>
#
# 1. database lawbid_demo; MIGRATOR_DATABASE_URL = the RDS admin on lawbid
# 2. migrations (they create the roles lawbid_app / lawbid_retention)
# 3. random passwords for the runtime roles; DATABASE_URL,
#    RETENTION_DATABASE_URL, DEMO_DATABASE_URL written to Secrets Manager.
# Nothing secret is printed. The admin URL is handed to the task as an
# environment override for the few minutes the task runs.
set -euo pipefail
TAG="${1:?image tag of the API image to migrate with}"
P="${SECRET_PREFIX:-lawbid-prod}"; CLUSTER="${CLUSTER:-lawbid-prod}"
cd "$(dirname "$0")/../.."

M="$(aws secretsmanager get-secret-value --secret-id "$P/postgres-master" --query SecretString --output text)"
field() { printf '%s' "$M" | python3 -c 'import sys,json;print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }
HOST="$(field host)"; USERN="$(field username)"
ENC="$(printf '%s' "$(field password)" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read(),safe=""))')"
url() { printf 'postgresql://%s:%s@%s:5432/%s?sslmode=require' "$USERN" "$ENC" "$HOST" "$1"; }
ROLEURL() { printf 'postgresql://%s:%s@%s:5432/%s?sslmode=require' "$1" "$2" "$HOST" "$3"; }
put() { printf '%s' "$2" | aws secretsmanager put-secret-value --secret-id "$P/$1" --secret-string file:///dev/stdin >/dev/null; echo "  $1 ✓"; }

SUBNETS="$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${CLUSTER}-private-*" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')"
SG="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${CLUSTER}-tasks" --query 'SecurityGroups[0].GroupId' --output text)"
IMAGE="${ECR_REGISTRY:-047754151252.dkr.ecr.us-east-1.amazonaws.com}/lawbid-api:${TAG}"

# sql_task <label> <admin db> <sql> : runs `prisma db execute` in the VPC.
sql_task() {
  local label="$1" db="$2" sql="$3" td overrides arn exit
  td="$(aws ecs describe-task-definition --task-definition "${CLUSTER}-migrate" --query taskDefinition)"
  printf '%s' "$td" > /tmp/prod-db-td.json
  node -e '
    const fs=require("fs");const td=JSON.parse(fs.readFileSync("/tmp/prod-db-td.json","utf8"));
    for(const c of td.containerDefinitions){c.image=process.argv[1];}
    for(const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"])delete td[k];
    fs.writeFileSync("/tmp/prod-db-td.new.json",JSON.stringify(td));' "$IMAGE"
  td="$(aws ecs register-task-definition --cli-input-json file:///tmp/prod-db-td.new.json --query taskDefinition.taskDefinitionArn --output text)"
  overrides="$(SQL="$sql" ADMIN_URL="$(url "$db")" node -e '
    process.stdout.write(JSON.stringify({containerOverrides:[{name:"migrate",
      command:["sh","-c","printf \"%s\" \"$SQL\" | npx prisma db execute --url \"$ADMIN_URL\" --stdin"],
      environment:[{name:"SQL",value:process.env.SQL},{name:"ADMIN_URL",value:process.env.ADMIN_URL}]}]}));')"
  arn="$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$td" \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
    --overrides "$overrides" --query 'tasks[0].taskArn' --output text)"
  aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$arn"
  exit="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$arn" --query 'tasks[0].containers[0].exitCode' --output text)"
  echo "  $label: exit $exit"
  [ "$exit" = "0" ]
}

echo "1/3 database lawbid_demo, migrator secret"
sql_task "create lawbid_demo" postgres 'CREATE DATABASE lawbid_demo;' || echo "  (already exists is fine)"
put MIGRATOR_DATABASE_URL "$(url lawbid)"

echo "2/3 migrations"
ECR_REGISTRY="${ECR_REGISTRY:-047754151252.dkr.ecr.us-east-1.amazonaws.com}" sh scripts/deploy/run-migrations.sh "$CLUSTER" "$TAG"

echo "3/3 runtime roles and secrets"
APPPW="$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40)"
RETPW="$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40)"
sql_task "role passwords" lawbid "ALTER ROLE lawbid_app PASSWORD '${APPPW}'; ALTER ROLE lawbid_retention PASSWORD '${RETPW}';"
put DATABASE_URL "$(ROLEURL lawbid_app "$APPPW" lawbid)"
put RETENTION_DATABASE_URL "$(ROLEURL lawbid_retention "$RETPW" lawbid)"
put DEMO_DATABASE_URL "$(url lawbid_demo)"
echo "done: now run Deploy (Actions) or restart the services."
