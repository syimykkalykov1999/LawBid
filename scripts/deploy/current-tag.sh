#!/usr/bin/env sh
# Prints the image tags the prod services run right now, as tfvars lines.
# Run before every `terraform apply` in infra/envs/prod: Deploy registers new
# task definitions outside Terraform, so an apply with the old tag in
# terraform.tfvars would roll production back to the first-launch version.
set -eu
CLUSTER="${CLUSTER:-lawbid-prod}"
for SVC in api admin; do
  TD=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].taskDefinition' --output text)
  IMG=$(aws ecs describe-task-definition --task-definition "$TD" --query "taskDefinition.containerDefinitions[?name=='$SVC'].image | [0]" --output text)
  echo "${SVC}_image = \"$IMG\""
done
