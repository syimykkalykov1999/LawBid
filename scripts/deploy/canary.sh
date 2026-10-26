#!/usr/bin/env sh
# Canary before the rolling deploy (OFF unless CANARY_ENABLED=true).
#
# One extra ECS service `api-canary` runs ONE task with the NEW image behind the
# same ALB target group as the real api, so it takes a small share of live
# traffic. For CANARY_BAKE_MINUTES we watch the api alarms (5xx ratio / p95 /
# unhealthy hosts, the same ones ECS watches during a rollout): an alarm that
# was NOT already firing before the canary, a failed canary rollout, or a canary
# task that stops, fails the job (exit 1) BEFORE the real api is touched = the
# production api never left the old release. On success the canary service is
# removed and the normal rolling deploy (roll-services.sh) continues.
# The canary service is always deleted on exit (trap), also after a failure.
#
#   canary.sh <cluster> <tag>
#   CANARY_ENABLED         "true" to run (default off: exits 0 at once)
#   CANARY_BAKE_MINUTES    watch time after the task is healthy (default 5)
#   CANARY_START_TIMEOUT_SECONDS  wait for the canary task to run (default 600)
#   CANARY_ALARMS          space-separated alarm names (default: <cluster>-api-5xx-ratio,
#                          -api-p95, -api-unhealthy-hosts)
#   CANARY_POLL_SECONDS    poll interval (default 20)
set -eu
CLUSTER="$1"; TAG="$2"
if [ "${CANARY_ENABLED:-false}" != "true" ]; then echo "canary: off (CANARY_ENABLED is not true)"; exit 0; fi
BAKE_MIN="${CANARY_BAKE_MINUTES:-5}"
START_TIMEOUT="${CANARY_START_TIMEOUT_SECONDS:-600}"
POLL="${CANARY_POLL_SECONDS:-20}"
ALARMS="${CANARY_ALARMS:-${CLUSTER}-api-5xx-ratio ${CLUSTER}-api-p95 ${CLUSTER}-api-unhealthy-hosts}"
REGISTRY="${ECR_REGISTRY:?ECR_REGISTRY is required}"
SVC=api-canary
WORK="$(mktemp -d)"

remove_canary() {
  STATUS=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].status' --output text 2>/dev/null || echo None)
  case "$STATUS" in ACTIVE|DRAINING)
    aws ecs update-service --cluster "$CLUSTER" --service "$SVC" --desired-count 0 >/dev/null 2>&1 || true
    aws ecs delete-service --cluster "$CLUSTER" --service "$SVC" --force >/dev/null 2>&1 || true
    echo "canary: service $SVC removed" ;;
  esac
}
trap 'remove_canary; rm -rf "$WORK"' EXIT

firing() { # alarm names currently in ALARM state, sorted, one line
  # shellcheck disable=SC2086
  aws cloudwatch describe-alarms --alarm-names $ALARMS --state-value ALARM --query 'MetricAlarms[].AlarmName' --output text | tr '\t' '\n' | sort | tr '\n' ' '
}

remove_canary # leftovers of an earlier aborted run
BASE_FIRING="$(firing)"
[ -z "$BASE_FIRING" ] || echo "canary: already firing before start (ignored): $BASE_FIRING"

# New revision of the api family with the new image (the real api is not touched).
aws ecs describe-task-definition --task-definition "${CLUSTER}-api" --query taskDefinition > "$WORK/td.json"
node -e '
  const fs = require("fs"); const w = process.argv[3];
  const td = JSON.parse(fs.readFileSync(w + "/td.json", "utf8"));
  for (const c of td.containerDefinitions.filter((c) => c.name === "api")) {
    c.image = process.argv[1];
    c.environment = (c.environment || []).filter((e) => e.name !== "APP_VERSION");
    c.environment.push({ name: "APP_VERSION", value: process.argv[2] });
  }
  for (const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"]) delete td[k];
  fs.writeFileSync(w + "/td.new.json", JSON.stringify(td));
' "${REGISTRY}/lawbid-api:${TAG}" "$TAG" "$WORK"
REV=$(aws ecs register-task-definition --cli-input-json "file://$WORK/td.new.json" --query taskDefinition.taskDefinitionArn --output text)

# Same network and the main target group as the real api service.
aws ecs describe-services --cluster "$CLUSTER" --services api --query 'services[0]' > "$WORK/api.json"
node -e '
  const fs = require("fs"); const w = process.argv[4];
  const s = JSON.parse(fs.readFileSync(w + "/api.json", "utf8"));
  const lb = (s.loadBalancers || []).slice(0, 1).map((l) => ({ targetGroupArn: l.targetGroupArn, containerName: l.containerName, containerPort: l.containerPort }));
  fs.writeFileSync(w + "/svc.json", JSON.stringify({
    cluster: process.argv[1], serviceName: process.argv[2], taskDefinition: process.argv[3],
    desiredCount: 1, launchType: "FARGATE",
    networkConfiguration: s.networkConfiguration, loadBalancers: lb,
    healthCheckGracePeriodSeconds: s.healthCheckGracePeriodSeconds || 60,
    deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100, deploymentCircuitBreaker: { enable: true, rollback: false } },
    propagateTags: "SERVICE",
  }));
' "$CLUSTER" "$SVC" "$REV" "$WORK"
aws ecs create-service --cli-input-json "file://$WORK/svc.json" >/dev/null
echo "canary: started 1 task of $REV behind the ALB (tag $TAG)"

# 1) wait until the canary task runs and its rollout is COMPLETED.
start=$(date +%s)
while :; do
  OUT=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].[deployments[0].rolloutState,runningCount]' --output text 2>/dev/null || true)
  STATE=$(printf '%s' "$OUT" | cut -f1); RUNNING=$(printf '%s' "$OUT" | cut -f2)
  if [ "$STATE" = "COMPLETED" ] && [ "$RUNNING" = "1" ]; then break; fi
  if [ "$STATE" = "FAILED" ]; then echo "::error::canary task never became healthy (rollout FAILED). The real api was not touched."; exit 1; fi
  if [ $(( $(date +%s) - start )) -ge "$START_TIMEOUT" ]; then echo "::error::canary task not healthy after ${START_TIMEOUT}s. The real api was not touched."; exit 1; fi
  sleep "$POLL"
done
echo "canary: task healthy, watching ${BAKE_MIN} min"

# 2) bake: watch alarms and the canary task.
end=$(( $(date +%s) + BAKE_MIN * 60 ))
while [ "$(date +%s)" -lt "$end" ]; do
  NOW="$(firing)"
  for A in $NOW; do
    case " $BASE_FIRING" in *" $A "*) ;; *) echo "::error::canary: alarm $A fired during the bake. The real api was not touched."; exit 1 ;; esac
  done
  RUNNING=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].runningCount' --output text 2>/dev/null || echo 0)
  if [ "$RUNNING" != "1" ]; then echo "::error::canary task stopped during the bake (running=$RUNNING). The real api was not touched."; exit 1; fi
  sleep "$POLL"
done
echo "canary: passed, continuing with the rolling deploy"
