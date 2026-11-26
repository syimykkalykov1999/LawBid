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
#                          -api-p95, -api-unhealthy-hosts and, Б2, the business fast-burn
#                          SLO alarms -slo-login-fast, -slo-message-fast, -slo-pay-fast)
#   CANARY_POLL_SECONDS    poll interval (default 20)
#   CANARY_COMPARE         Б2 (SRE Workbook ch. 16): "on" (default) also compares the
#                          canary task with the control (the old tasks) after the bake,
#                          from the API's minute `{metric:"slo", release, httpReq,
#                          http5xx}` lines (scripts/deploy/canary-compare.mjs); "off" = skip
#   CANARY_MIN_REQUESTS    fewer requests on either side = no verdict (default 50)
#   CANARY_FLOOR           canary 5xx share may exceed 2 x control by this much (default 0.005)
set -eu
CLUSTER="$1"; TAG="$2"
if [ "${CANARY_ENABLED:-false}" != "true" ]; then echo "canary: off (CANARY_ENABLED is not true)"; exit 0; fi
# X1 (25.11): with the ECS built-in canary / linear (infra var.api_native_deploy)
# ECS itself sends a share of the traffic to the new release and shifts back on
# an alarm; an extra api-canary task in the same target group would only get in
# its way. deploy.yml skips this step then; this guard covers a manual run.
STRATEGY=$(aws ecs describe-services --cluster "$CLUSTER" --services api \
  --query 'services[0].deploymentConfiguration.strategy' --output text 2>/dev/null || echo None)
case "$STRATEGY" in CANARY|LINEAR|BLUE_GREEN)
  echo "canary: api uses the ECS built-in $STRATEGY deployment, this script is not needed"; exit 0 ;;
esac
BAKE_MIN="${CANARY_BAKE_MINUTES:-5}"
START_TIMEOUT="${CANARY_START_TIMEOUT_SECONDS:-600}"
POLL="${CANARY_POLL_SECONDS:-20}"
ALARMS="${CANARY_ALARMS:-${CLUSTER}-api-5xx-ratio ${CLUSTER}-api-p95 ${CLUSTER}-api-unhealthy-hosts ${CLUSTER}-slo-login-fast ${CLUSTER}-slo-message-fast ${CLUSTER}-slo-pay-fast}"
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
  # Б2: the slo-*-fast alarms are composite; describe-alarms returns only metric
  # alarms unless --alarm-types asks for both.
  # shellcheck disable=SC2086
  aws cloudwatch describe-alarms --alarm-names $ALARMS --alarm-types MetricAlarm CompositeAlarm --state-value ALARM \
    --query '[MetricAlarms[].AlarmName, CompositeAlarms[].AlarmName][]' --output text | tr -s '\t ' '\n' | grep -v -e '^None$' -e '^$' | sort | tr '\n' ' '
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
BAKE_START_MS=$(( $(date +%s) * 1000 ))

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

# 3) Б2: canary vs control (SRE Workbook ch. 16). The fleet-wide alarms above
# average one canary task with N old ones; here its own 5xx share is put next
# to the old tasks' share over the same minutes.
if [ "${CANARY_COMPARE:-on}" != "off" ]; then
  LOG_GROUP=$(node -e '
    const td = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const c = td.containerDefinitions.find((c) => c.name === "api") || {};
    process.stdout.write(((c.logConfiguration || {}).options || {})["awslogs-group"] || "");
  ' "$WORK/td.json")
  if [ -z "$LOG_GROUP" ]; then
    echo "canary: no awslogs group in the api task definition, canary-vs-control skipped"
  else
    # The minute lines of the last minute of the bake land a little later.
    sleep "${CANARY_COMPARE_SETTLE_SECONDS:-70}"
    aws logs filter-log-events --log-group-name "$LOG_GROUP" --start-time "$BAKE_START_MS" \
      --filter-pattern '{ $.metric = "slo" }' --query 'events[].message' --output json > "$WORK/slo-lines.json"
    if ! node "$(dirname "$0")/canary-compare.mjs" "$TAG" "${CANARY_MIN_REQUESTS:-50}" "${CANARY_FLOOR:-0.005}" 2 < "$WORK/slo-lines.json"; then
      echo "::error::canary: its 5xx share is far above the old tasks' (canary vs control). The real api was not touched."
      exit 1
    fi
  fi
fi
echo "canary: passed, continuing with the rolling deploy"
