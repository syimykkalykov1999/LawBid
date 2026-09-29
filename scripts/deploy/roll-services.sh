#!/usr/bin/env sh
# docs/06 §7.3: new task-definition revisions pointing at the image tag,
# rolling update (min 100 % healthy, ECS circuit breaker rolls back a bad
# revision), waits until the services are stable.
set -eu
CLUSTER="$1"; TAG="$2"
REGISTRY="${ECR_REGISTRY:?ECR_REGISTRY is required}"
for SVC in api worker admin; do
  FAMILY="${CLUSTER}-${SVC}"
  IMAGE="${REGISTRY}/lawbid-$( [ "$SVC" = admin ] && echo admin || echo api ):${TAG}"
  aws ecs describe-task-definition --task-definition "$FAMILY" --query 'taskDefinition' > td.json
  node -e '
    const fs = require("fs");
    const td = JSON.parse(fs.readFileSync("td.json", "utf8"));
    for (const c of td.containerDefinitions) {
      c.image = process.argv[1];
      c.environment = (c.environment || []).filter((e) => e.name !== "APP_VERSION");
      c.environment.push({ name: "APP_VERSION", value: process.argv[2] });
    }
    for (const k of ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities","registeredAt","registeredBy","deregisteredAt"]) delete td[k];
    fs.writeFileSync("td.new.json", JSON.stringify(td));
  ' "$IMAGE" "$TAG"
  REV=$(aws ecs register-task-definition --cli-input-json file://td.new.json --query 'taskDefinition.taskDefinitionArn' --output text)
  aws ecs update-service --cluster "$CLUSTER" --service "$SVC" --task-definition "$REV" >/dev/null
  echo "$SVC -> $REV"
done
aws ecs wait services-stable --cluster "$CLUSTER" --services api worker admin
