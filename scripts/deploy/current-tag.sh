#!/usr/bin/env sh
# Prints the image tags the prod services run right now, as tfvars lines.
# Run before every `terraform apply` in infra/envs/prod: Deploy registers new
# task definitions outside Terraform, so an apply with the old tag in
# terraform.tfvars would roll production back to the first-launch version.
set -eu
CLUSTER="${CLUSTER:-lawbid-prod}"
OUT=""
for SVC in api admin; do
  TD=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].taskDefinition' --output text)
  IMG=$(aws ecs describe-task-definition --task-definition "$TD" --query "taskDefinition.containerDefinitions[?name=='$SVC'].image | [0]" --output text)
  # A missing service / task definition prints "None": that must stop here, not
  # become `api_image = "None"` in a terraform plan or apply.
  case "$IMG" in
    ""|None|null) echo "current-tag.sh: no image found for service $SVC in cluster $CLUSTER" >&2; exit 1 ;;
    */*:*) ;; # <registry>/<repo>:<tag>
    *) echo "current-tag.sh: unexpected image '$IMG' for service $SVC (want <registry>/<repo>:<tag>)" >&2; exit 1 ;;
  esac
  OUT="${OUT}${SVC}_image = \"$IMG\"
"
done
# Printed only when BOTH services resolved: no half-written tfvars.
printf '%s' "$OUT"
