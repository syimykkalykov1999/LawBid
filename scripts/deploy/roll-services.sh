#!/usr/bin/env sh
# docs/06 §7.3: new task-definition revisions pointing at the image tag,
# rolling update (min 100 % healthy). A bad revision is rolled back by ECS
# itself: the deployment circuit breaker (tasks never become healthy) and the
# CloudWatch alarms of infra/modules/ecs (5xx / p95 / unhealthy hosts, watched
# during the rollout and the bake time ECS derives from the alarms).
#
# P1 deploy safety (2026-10-24): `aws ecs wait services-stable` is NOT enough:
# after a rollback the service is "stable" again (on the OLD revision), so the
# job went green although the release was rejected, and its 10 minute limit is
# shorter than rollout + alarm bake time. This script polls the rolloutState
# of OUR revision instead and fails on FAILED (= rolled back) or on timeout.
#   ROLL_TIMEOUT_SECONDS  total wait (default 1800 = 30 min)
#   ROLL_POLL_SECONDS     poll interval (default 10)
#
# S11-14 / S11-9: which services to roll is the third argument (or SERVICES),
# a space-separated subset of "api worker admin" (default: all three). The
# deploy rolls api first, smokes it, then worker and admin; a rollback of one
# failing service passes only that one.
#   roll-services.sh <cluster> <tag> [services]
set -eu
CLUSTER="$1"; TAG="$2"; SERVICES="${3:-${SERVICES:-api worker admin}}"
for S in $SERVICES; do
  case "$S" in api|worker|admin) ;; *) echo "unknown service '$S' (api, worker, admin)" >&2; exit 2 ;; esac
done
ROLL_TIMEOUT_SECONDS="${ROLL_TIMEOUT_SECONDS:-1800}"
ROLL_POLL_SECONDS="${ROLL_POLL_SECONDS:-10}"
REVS=""
REGISTRY="${ECR_REGISTRY:?ECR_REGISTRY is required}"
for SVC in $SERVICES; do
  FAMILY="${CLUSTER}-${SVC}"
  IMAGE="${REGISTRY}/lawbid-$( [ "$SVC" = admin ] && echo admin || echo api ):${TAG}"
  aws ecs describe-task-definition --task-definition "$FAMILY" --query 'taskDefinition' > td.json
  node -e '
    const fs = require("fs");
    const td = JSON.parse(fs.readFileSync("td.json", "utf8"));
    // Only the app container: sidecars (clamav in the worker) keep their image.
    for (const c of td.containerDefinitions.filter((c) => c.name === process.argv[3])) {
      c.image = process.argv[1];
      c.environment = (c.environment || []).filter((e) => e.name !== "APP_VERSION");
      c.environment.push({ name: "APP_VERSION", value: process.argv[2] });
    }
    for (const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"]) delete td[k];
    fs.writeFileSync("td.new.json", JSON.stringify(td));
  ' "$IMAGE" "$TAG" "$SVC"
  REV=$(aws ecs register-task-definition --cli-input-json file://td.new.json --query 'taskDefinition.taskDefinitionArn' --output text)
  aws ecs update-service --cluster "$CLUSTER" --service "$SVC" --task-definition "$REV" >/dev/null
  echo "$SVC -> $REV"
  REVS="$REVS $SVC=$REV"
done

# Wait until every service has OUR revision as COMPLETED, nothing else left.
start=$(date +%s)
for pair in $REVS; do
  SVC="${pair%%=*}"; REV="${pair#*=}"
  while :; do
    # rolloutState of the deployment that runs our task definition.
    OUT=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" \
      --query "services[0].deployments[?taskDefinition=='${REV}'].[rolloutState,rolloutStateReason]|[0]" --output text 2>/dev/null || true)
    STATE=$(printf '%s' "$OUT" | cut -f1)
    case "$STATE" in
      COMPLETED)
        # Our revision is complete; make sure ECS finished removing the old one.
        N=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'length(services[0].deployments)' --output text)
        if [ "$N" = "1" ]; then echo "$SVC: rollout COMPLETED"; break; fi
        ;;
      FAILED)
        echo "::error::$SVC: rollout FAILED and was rolled back by ECS ($OUT)"
        aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" \
          --query 'services[0].events[0:8].message' --output text || true
        exit 1
        ;;
      "" | None)
        # Our deployment is gone: replaced by a rollback or a newer deploy.
        echo "::error::$SVC: revision $REV is no longer deploying (rolled back or replaced)"
        exit 1
        ;;
    esac
    if [ $(( $(date +%s) - start )) -ge "$ROLL_TIMEOUT_SECONDS" ]; then
      echo "::error::$SVC: rollout still $STATE after ${ROLL_TIMEOUT_SECONDS}s"
      exit 1
    fi
    sleep "$ROLL_POLL_SECONDS"
  done
done
echo "services ($SERVICES) rolled out to $TAG"
