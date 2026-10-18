#!/usr/bin/env bash
# Owner 2026-10-16: the prod database is RDS in private subnets, so the
# first super admin is made by a one-off ECS task inside the VPC (the Mac's
# docker cannot reach it; prod-run.sh seed/admin is for a reachable DB).
#   scripts/deploy/prod-admin-ecs.sh <image tag>          seed + super admin
#   scripts/deploy/prod-admin-ecs.sh <image tag> i18n     add what the
#        database lacks from the translations_seed.xlsx baked into the image
#        (every release, deploy.yml); texts already there — the owner's
#        uploads in Admin → Localization — are never overwritten
#   scripts/deploy/prod-admin-ecs.sh <image tag> i18n-full  re-import the
#        whole table, overwriting what differs (by hand only)
# Seed = reference data + all 85 languages from prisma/seed/translations_seed
# .xlsx (in the image) + the admin row. The e-mail, login and password are
# typed here (hidden), go into a temporary Secrets Manager secret that only
# the ECS execution role may read, reach the task as `secrets` (never in the
# task description or the logs) and the secret is force-deleted on exit,
# whatever happens. The task runs as the migrator role (like migrations).
# DRY_RUN=1 builds the task definition and stops before registering it.
set -euo pipefail
TAG="${1:?image tag (scripts/deploy/current-tag.sh)}"; MODE="${2:-admin}"
P="${SECRET_PREFIX:-lawbid-prod}"; CLUSTER="${CLUSTER:-lawbid-prod}"
REGION="${AWS_REGION:-us-east-1}"; export AWS_REGION="$REGION"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
IMAGE="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/lawbid-api:${TAG}"
EXEC_ROLE="arn:aws:iam::${ACCOUNT}:role/${CLUSTER}-ecs-execution"
FAMILY="${CLUSTER}-oneoff"
WORK="$(mktemp -d)"; TMP_SECRET=""; TD_ARN=""
cleanup() {
  rm -rf "$WORK"
  if [ -n "$TMP_SECRET" ]; then
    aws secretsmanager delete-secret --secret-id "$TMP_SECRET" \
      --force-delete-without-recovery >/dev/null 2>&1 \
      && echo "  temporary secret deleted ✓" \
      || echo "  !! delete it by hand: aws secretsmanager delete-secret --secret-id $TMP_SECRET --force-delete-without-recovery"
  fi
  if [ -n "$TD_ARN" ]; then
    aws ecs deregister-task-definition --task-definition "$TD_ARN" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

case "$MODE" in
  admin)
    read -rp  "E-mail супер-админа: " A_EMAIL
    read -rp  "Логин для входа в админку: " A_LOGIN
    read -rsp "Пароль (не виден): " A_PASS; echo
    read -rsp "Пароль ещё раз: " A_PASS2; echo
    [ "$A_PASS" = "$A_PASS2" ] || { echo "пароли не совпали" >&2; exit 1; }
    case "$A_EMAIL" in *@*.*) ;; *) echo "это не e-mail: нужен адрес вида name@example.com" >&2; exit 1 ;; esac
    # Same rules as admin-password.util.ts, checked here so a typo does not
    # cost a task run.
    A_LOGIN="$(printf '%s' "$A_LOGIN" | tr '[:upper:]' '[:lower:]')"
    printf '%s' "$A_LOGIN" | grep -Eq '^[a-z0-9][a-z0-9._-]{2,38}[a-z0-9]$' \
      || { echo "логин: 4-40 символов, латиница/цифры/._- (не e-mail)" >&2; exit 1; }
    [ "${#A_PASS}" -ge 10 ] && printf '%s' "$A_PASS" | grep -q '[A-Za-z]' && printf '%s' "$A_PASS" | grep -q '[0-9]' \
      || { echo "пароль: от 10 символов, буквы и цифры" >&2; exit 1; }
    case "$(printf '%s' "$A_PASS" | tr '[:upper:]' '[:lower:]')" in *"$A_LOGIN"*) echo "пароль не должен содержать логин" >&2; exit 1 ;; esac
    if [ "${DRY_RUN:-}" = "1" ]; then
      TMP_SECRET_ARN_FOR_TD="arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${P}/tmp-admin-dry"
    else
      echo "1/3 temporary secret"
      TMP_SECRET="$(A_EMAIL="$A_EMAIL" A_LOGIN="$A_LOGIN" A_PASS="$A_PASS" node -e '
        process.stdout.write(JSON.stringify({email:process.env.A_EMAIL.trim(),login:process.env.A_LOGIN,password:process.env.A_PASS}))' \
        | aws secretsmanager create-secret --name "${P}/tmp-admin-$(date +%s)" \
            --description "one-off super admin bootstrap; deleted by prod-admin-ecs.sh" \
            --secret-string file:///dev/stdin --query ARN --output text)"
      printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":"%s"},"Action":"secretsmanager:GetSecretValue","Resource":"*"}]}' "$EXEC_ROLE" > "$WORK/policy.json"
      aws secretsmanager put-resource-policy --secret-id "$TMP_SECRET" \
        --resource-policy "file://$WORK/policy.json" >/dev/null
      TMP_SECRET_ARN_FOR_TD="$TMP_SECRET"
    fi
    unset A_PASS A_PASS2
    # Output that could carry the e-mail (lines with @) stays out of the logs.
    # The seed writes ~400k translation rows the first time (15-40 min).
    CMD='{ node dist/prisma/seed.js 2>&1; echo $? > /tmp/seed.rc; } | grep -v @; rc=$(cat /tmp/seed.rc); [ "$rc" -eq 0 ] || exit "$rc"; node dist/src/cli/set-admin-credentials.js >/dev/null && echo "super admin: credentials saved"'
    ;;
  i18n)
    echo "1/3 (no secret needed)"
    TMP_SECRET_ARN_FOR_TD=""
    CMD='node dist/src/cli/import-translations.js prisma/seed/translations_seed.xlsx --missing-only 2>&1 | cut -c1-300'
    ;;
  i18n-full)
    echo "1/3 (no secret needed)"
    TMP_SECRET_ARN_FOR_TD=""
    CMD='node dist/src/cli/import-translations.js prisma/seed/translations_seed.xlsx 2>&1 | cut -c1-300'
    ;;
  *) echo "unknown mode: $MODE (admin | i18n | i18n-full)" >&2; exit 2 ;;
esac

echo "2/3 task definition (copy of ${CLUSTER}-api, image ${TAG})"
aws ecs describe-task-definition --task-definition "${CLUSTER}-api" --query taskDefinition > "$WORK/api.json"
MIGRATOR_ARN="$(aws ecs describe-task-definition --task-definition "${CLUSTER}-migrate" \
  --query 'taskDefinition.containerDefinitions[0].secrets[?name==`DATABASE_URL`].valueFrom | [0]' --output text)"
IMAGE="$IMAGE" FAMILY="$FAMILY" MIGRATOR_ARN="$MIGRATOR_ARN" TMP="$TMP_SECRET_ARN_FOR_TD" node -e '
  const fs=require("fs"); const td=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  for (const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"]) delete td[k];
  td.family=process.env.FAMILY;
  const c=td.containerDefinitions.find(x=>x.name==="api");
  td.containerDefinitions=[c];
  c.image=process.env.IMAGE; delete c.healthCheck; c.portMappings=[];
  c.environment=(c.environment||[]).filter(e=>e.name!=="JOBS_ENABLED").concat([{name:"JOBS_ENABLED",value:"false"}]);
  c.secrets=(c.secrets||[]).filter(s=>s.name!=="DATABASE_URL").concat([{name:"DATABASE_URL",valueFrom:process.env.MIGRATOR_ARN}]);
  const t=process.env.TMP;
  if (t) c.secrets.push({name:"SEED_ADMIN_EMAIL",valueFrom:t+":email::"},{name:"ADMIN_SET_LOGIN",valueFrom:t+":login::"},{name:"ADMIN_SET_PASSWORD",valueFrom:t+":password::"});
  fs.writeFileSync(process.argv[2],JSON.stringify(td));' "$WORK/api.json" "$WORK/td.json"
if [ "${DRY_RUN:-}" = "1" ]; then
  node -e 'const t=require(process.argv[1]);const c=t.containerDefinitions[0];console.log("DRY_RUN ok:",t.family,c.image,"secrets:",c.secrets.map(s=>s.name).join(","))' "$WORK/td.json"
  exit 0
fi
TD_ARN="$(aws ecs register-task-definition --cli-input-json "file://$WORK/td.json" --query taskDefinition.taskDefinitionArn --output text)"

echo "3/3 one-off task in the VPC (first seed: 15-40 min; you may close this window, the task keeps running)"
SUBNETS="$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${CLUSTER}-private-*" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')"
SG="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${CLUSTER}-tasks" --query 'SecurityGroups[0].GroupId' --output text)"
OVR="$(CMD="$CMD" node -e 'process.stdout.write(JSON.stringify({containerOverrides:[{name:"api",command:["sh","-c",process.env.CMD]}]}))')"
ARN="$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$TD_ARN" \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG}],assignPublicIp=DISABLED}" \
  --overrides "$OVR" --query 'tasks[0].taskArn' --output text)"
echo "  task: ${ARN##*/}"
# Own wait (the CLI waiter gives up after 10 min). If the AWS login runs
# out, the task still finishes in AWS: check it later with the line below.
CHECK="aws ecs describe-tasks --cluster $CLUSTER --tasks $ARN --query 'tasks[0].[lastStatus,containers[0].exitCode]' --output text"
for _ in $(seq 1 240); do
  if ! ST="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$ARN" --query 'tasks[0].lastStatus' --output text 2>/dev/null)"; then
    echo "  AWS login ran out; the task keeps running. Later: aws login && $CHECK"
    exit 3
  fi
  [ "$ST" = "STOPPED" ] && break
  printf '.'; sleep 15
done
echo
EXIT="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$ARN" --query 'tasks[0].containers[0].exitCode' --output text)"
REASON="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$ARN" --query 'tasks[0].stoppedReason' --output text)"
GROUP="$(node -e 'const t=require(process.argv[1]);process.stdout.write(t.containerDefinitions[0].logConfiguration.options["awslogs-group"])' "$WORK/td.json")"
SP="$(node -e 'const t=require(process.argv[1]);process.stdout.write(t.containerDefinitions[0].logConfiguration.options["awslogs-stream-prefix"])' "$WORK/td.json")"
echo "---- task log ----"
aws logs get-log-events --log-group-name "$GROUP" --log-stream-name "${SP}/api/${ARN##*/}" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' | tail -25 || true
echo "------------------"
echo "exit code: $EXIT  ($REASON)"
if [ "$EXIT" = "0" ]; then echo "DONE ✓"; else echo "FAILED"; exit 1; fi
