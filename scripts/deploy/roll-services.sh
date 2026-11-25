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
#
# KNOWN_ERRORS 182 (16.11, pooler switch; scripts/infra/pooler-roll.sh):
#   TD_FROM=running   copy the revision the service RUNS now instead of the
#                     family's newest one (the drain before the pooler goes:
#                     Terraform has not registered its new revision yet);
#   DB_POOL_ENV_JSON  {"api":{"DB_POOL_SIZE":"5"},"worker":{...}}: the app
#                     container's DB_POOL* variables become exactly these
#                     (DB_POOLER_HOST / _PORT / _CA_PEM not listed = removed).
#
# X1 (25.11): a service whose deploymentConfiguration.strategy is CANARY, LINEAR
# or BLUE_GREEN (infra var.api_native_deploy) is shifted by ECS itself: green
# target group, canary share, bake, 100 %, shift back on an alarm or the circuit
# breaker. For it this script waits for THAT service deployment (ECS
# ListServiceDeployments -> DescribeServiceRevisions -> DescribeServiceDeployments):
# SUCCESSFUL = done, ROLLBACK_* / STOPPED = ECS rejected the release (exit 1).
# ROLLING services (today's default) keep the rolloutState wait below unchanged.
set -eu
CLUSTER="$1"; TAG="$2"; SERVICES="${3:-${SERVICES:-api worker admin}}"
for S in $SERVICES; do
  case "$S" in api|worker|admin) ;; *) echo "unknown service '$S' (api, worker, admin)" >&2; exit 2 ;; esac
done
ROLL_TIMEOUT_SECONDS="${ROLL_TIMEOUT_SECONDS:-1800}"
ROLL_POLL_SECONDS="${ROLL_POLL_SECONDS:-10}"
REVS=""
REGISTRY="${ECR_REGISTRY:?ECR_REGISTRY is required}"
# 13.11 (KE 126 audit): on ARM64 tasks an image without an arm64 build cannot
# start (images before 22.10 are amd64 only — a rollback or a manual
# image_tag). Checked for every service BEFORE any of them is touched.
for SVC in $SERVICES; do
  ARCH=$(aws ecs describe-task-definition --task-definition "${CLUSTER}-${SVC}" \
    --query 'taskDefinition.runtimePlatform.cpuArchitecture' --output text 2>/dev/null || echo None)
  if [ "$ARCH" = ARM64 ]; then
    "$(dirname "$0")/../ops/arm64-check.sh" "lawbid-$( [ "$SVC" = admin ] && echo admin || echo api ):${TAG}" \
      || { echo "::error::$SVC runs on ARM64 but lawbid-*:${TAG} has no arm64 build"; exit 1; }
  fi
done
# new_revision <source task definition> <image> <app container>: registers a
# copy of the source with the app container on <image> (APP_VERSION = $TAG)
# and prints the new revision's ARN. The pool key of DB_POOL_ENV_JSON is the
# container name (api-admin's container is `api`).
new_revision() {
  aws ecs describe-task-definition --task-definition "$1" --query 'taskDefinition' > td.json || return 1
  node -e '
    const fs = require("fs");
    const td = JSON.parse(fs.readFileSync("td.json", "utf8"));
    // Only the app container: sidecars (clamav in the worker) keep their image.
    for (const c of td.containerDefinitions.filter((c) => c.name === process.argv[3])) {
      c.image = process.argv[1];
      c.environment = (c.environment || []).filter((e) => e.name !== "APP_VERSION");
      c.environment.push({ name: "APP_VERSION", value: process.argv[2] });
      // KNOWN_ERRORS 182: the database connection settings, when given.
      const pool = process.env.DB_POOL_ENV_JSON ? JSON.parse(process.env.DB_POOL_ENV_JSON)[process.argv[3]] : undefined;
      if (pool) {
        c.environment = c.environment.filter((e) => !e.name.startsWith("DB_POOL"));
        for (const [name, value] of Object.entries(pool)) c.environment.push({ name, value: String(value) });
      }
    }
    // 13.11 (KNOWN_ERRORS 126): lawbid-clamav:1.4 is amd64 only (and expires
    // under the ECR keep rule); :1.4-debian is the same ClamAV, multi-arch
    // (the same rule as infra/envs/prod/main.tf).
    for (const c of td.containerDefinitions) c.image = c.image.replace(/(\/lawbid-clamav:1\.4)$/, "$1-debian");
    for (const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"]) delete td[k];
    fs.writeFileSync("td.new.json", JSON.stringify(td));
  ' "$2" "$TAG" "$3" || return 1
  aws ecs register-task-definition --cli-input-json file://td.new.json --query 'taskDefinition.taskDefinitionArn' --output text
}

ADM_PREV=""
NATIVE=""
for SVC in $SERVICES; do
  FAMILY="${CLUSTER}-${SVC}"
  IMAGE="${REGISTRY}/lawbid-$( [ "$SVC" = admin ] && echo admin || echo api ):${TAG}"
  SRC="$FAMILY"
  if [ "${TD_FROM:-family}" = running ]; then
    SRC=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].taskDefinition' --output text)
    case "$SRC" in arn:*) ;; *) echo "::error::$SVC: no running task definition ($SRC)" >&2; exit 1 ;; esac
  fi
  REV=$(new_revision "$SRC" "$IMAGE" "$SVC")
  # X1: which deployment strategy ECS uses for this service (None = ROLLING).
  STRATEGY=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" \
    --query 'services[0].deploymentConfiguration.strategy' --output text 2>/dev/null || echo None)
  case "$STRATEGY" in CANARY|LINEAR|BLUE_GREEN) NATIVE="$NATIVE $SVC" ;; esac
  aws ecs update-service --cluster "$CLUSTER" --service "$SVC" --task-definition "$REV" >/dev/null
  echo "$SVC -> $REV (strategy ${STRATEGY})"
  REVS="$REVS $SVC=$REV"
  # Owner 2026-11-11 («А»): the admin panel's API service runs api's image
  # (infra/modules/ecs aws_ecs_service.api_admin), when it exists. Row 204
  # (task_role_split): once Terraform put it on its own family
  # <cluster>-api-admin (own task role), it gets a revision of THAT family
  # with the same image; before that it shares api's revision, as before.
  if [ "$SVC" = api ] && [ "$(aws ecs describe-services --cluster "$CLUSTER" --services api-admin \
      --query 'services[?status==`ACTIVE`] | length(@)' --output text 2>/dev/null || echo 0)" = "1" ]; then
    ADM_RUN=$(aws ecs describe-services --cluster "$CLUSTER" --services api-admin --query 'services[0].taskDefinition' --output text)
    case "$ADM_RUN" in
      */"${CLUSTER}-api-admin":*)
        ADM_PREV="$ADM_RUN"
        ADM_SRC="${CLUSTER}-api-admin"
        [ "${TD_FROM:-family}" = running ] && ADM_SRC="$ADM_RUN"
        ADM_REV=$(new_revision "$ADM_SRC" "$IMAGE" api)
        ;;
      *) ADM_REV="$REV" ;;
    esac
    aws ecs update-service --cluster "$CLUSTER" --service api-admin --task-definition "$ADM_REV" >/dev/null
    echo "api-admin -> $ADM_REV"
    REVS="$REVS api-admin=$ADM_REV"
  fi
done

# D1-35 (13.11): api-admin runs api's revision (row 204: or its own family's
# revision with api's image). When api's rollout fails (ECS rolled api back)
# or is replaced, api-admin must not stay on the rejected release: put it on
# whatever api runs now (own family: the revision it ran before) and wait.
align_api_admin() {
  case " $REVS " in *" api-admin="*) ;; *) return 0 ;; esac
  if [ -n "$ADM_PREV" ]; then
    # Row 204: its own family; back to the revision it ran before this roll.
    CUR="$ADM_PREV"
  else
    CUR=$(aws ecs describe-services --cluster "$CLUSTER" --services api \
      --query 'services[0].taskDefinition' --output text 2>/dev/null || true)
  fi
  [ -n "$CUR" ] && [ "$CUR" != None ] || { echo "::warning::api-admin: could not read api's revision"; return 0; }
  aws ecs update-service --cluster "$CLUSTER" --service api-admin --task-definition "$CUR" >/dev/null \
    || { echo "::error::api-admin: could not move back to $CUR"; return 0; }
  echo "api-admin -> $CUR (back after the api rollback)"
  t0=$(date +%s)
  while [ $(( $(date +%s) - t0 )) -lt "$ROLL_TIMEOUT_SECONDS" ]; do
    ST=$(aws ecs describe-services --cluster "$CLUSTER" --services api-admin \
      --query "services[0].deployments[?taskDefinition=='${CUR}'].rolloutState|[0]" --output text 2>/dev/null || true)
    N=$(aws ecs describe-services --cluster "$CLUSTER" --services api-admin --query 'length(services[0].deployments)' --output text 2>/dev/null || echo 0)
    if [ "$ST" = COMPLETED ] && [ "$N" = "1" ]; then echo "api-admin: back on $CUR"; return 0; fi
    if [ "$ST" = FAILED ]; then echo "::error::api-admin: moving back to $CUR FAILED"; return 0; fi
    sleep "$ROLL_POLL_SECONDS"
  done
  echo "::error::api-admin: still moving back to $CUR after ${ROLL_TIMEOUT_SECONDS}s"
}

# X1: wait_native <service> <task definition>: the ECS built-in canary / linear
# deployment of our revision until it ends. 0 = SUCCESSFUL, 1 = rolled back,
# stopped or timed out (uses $start / ROLL_TIMEOUT_SECONDS like the loop below).
wait_native() {
  N_SVC="$1"; N_REV="$2"; N_DEP=""; N_LAST=""
  while :; do
    if [ -z "$N_DEP" ]; then
      # The newest service deployments (up to 20); ours targets a service
      # revision that runs N_REV.
      for N_LINE in $(aws ecs list-service-deployments --cluster "$CLUSTER" --service "$N_SVC" \
          --query 'serviceDeployments[].[serviceDeploymentArn,targetServiceRevisionArn]' --output text 2>/dev/null | tr '\t' '|'); do
        N_TD=$(aws ecs describe-service-revisions --service-revision-arns "${N_LINE#*|}" \
          --query 'serviceRevisions[0].taskDefinition' --output text 2>/dev/null || true)
        if [ "$N_TD" = "$N_REV" ]; then N_DEP="${N_LINE%%|*}"; echo "$N_SVC: ECS deployment $N_DEP"; break; fi
      done
    fi
    if [ -n "$N_DEP" ]; then
      N_OUT=$(aws ecs describe-service-deployments --service-deployment-arns "$N_DEP" \
        --query 'serviceDeployments[0].[status,lifecycleStage,statusReason]' --output text 2>/dev/null || true)
      N_STATUS=$(printf '%s' "$N_OUT" | cut -f1)
      N_NOW=$(printf '%s' "$N_OUT" | cut -f1-2)
      [ "$N_NOW" = "$N_LAST" ] || { echo "$N_SVC: $N_NOW"; N_LAST="$N_NOW"; }
      case "$N_STATUS" in
        SUCCESSFUL) echo "$N_SVC: ECS deployment SUCCESSFUL"; return 0 ;;
        ROLLBACK_*|STOPPED)
          echo "::error::$N_SVC: ECS rejected the release and shifted back ($N_OUT)"
          aws ecs describe-services --cluster "$CLUSTER" --services "$N_SVC" \
            --query 'services[0].events[0:8].message' --output text || true
          return 1 ;;
      esac
    fi
    if [ $(( $(date +%s) - start )) -ge "$ROLL_TIMEOUT_SECONDS" ]; then
      echo "::error::$N_SVC: ECS deployment ${N_DEP:-of $N_REV not found} still ${N_STATUS:-unknown} after ${ROLL_TIMEOUT_SECONDS}s"
      return 1
    fi
    sleep "$ROLL_POLL_SECONDS"
  done
}

# Wait until every service has OUR revision as COMPLETED, nothing else left.
start=$(date +%s)
for pair in $REVS; do
  SVC="${pair%%=*}"; REV="${pair#*=}"
  case " $NATIVE " in *" $SVC "*)
    if wait_native "$SVC" "$REV"; then continue; fi
    [ "$SVC" = api ] && align_api_admin
    exit 1 ;;
  esac
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
        [ "$SVC" = api ] && align_api_admin
        exit 1
        ;;
      "" | None)
        # Our deployment is gone: replaced by a rollback or a newer deploy.
        echo "::error::$SVC: revision $REV is no longer deploying (rolled back or replaced)"
        [ "$SVC" = api ] && align_api_admin
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
