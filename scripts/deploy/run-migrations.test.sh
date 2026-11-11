#!/usr/bin/env bash
# The migrate task's steps live in TWO places: the Terraform task definition
# (infra/modules/ecs/main.tf) and the command the deploy / infra pipelines
# put over it (scripts/deploy/run-migrations.sh). A step only in Terraform
# never runs (owner 2026-11-11: migrate-shards.mjs was missing from the
# deploy command, so the second database server would have stayed empty).
# Every node step of the Terraform command must be in the deploy command.
set -euo pipefail
cd "$(dirname "$0")/../.."
tf=$(grep -o 'node prisma/[a-z-]*\.mjs' infra/modules/ecs/main.tf | sort -u)
deploy=$(grep -o 'node prisma/[a-z-]*\.mjs' scripts/deploy/run-migrations.sh | sort -u)
missing=$(comm -23 <(echo "$tf") <(echo "$deploy"))
if [ -n "$missing" ]; then
  echo "run-migrations.sh does not run what the Terraform migrate task runs:" >&2
  echo "$missing" >&2
  exit 1
fi
echo "run-migrations.test: all passed ($(echo "$tf" | wc -l | tr -d ' ') steps)"
