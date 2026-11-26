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
# D8 (26.11): both commands start with the migrator role step, and every
# schema step runs with its URL (lawbid_migrator when the admin switch
# aws.db_migrator_role is on), never straight under the master user.
for f in infra/modules/ecs/main.tf scripts/deploy/run-migrations.sh; do
  # the command with its JSON / JS escapes taken out
  cmd=$(grep -m 1 -E 'command = \["sh", "-c", ' "$f" | tr -d '\\')
  case "$cmd" in
    *'"sh", "-c", "MIGRATE_URL="$DATABASE_URL"; if [ -f prisma/ensure-migrator-role.mjs ]; then MIGRATE_URL="$(node prisma/ensure-migrator-role.mjs)"; fi && [ -n "$MIGRATE_URL" ] && '*) ;;
    *) echo "$f: the migrate command must start with ensure-migrator-role.mjs" >&2; exit 1 ;;
  esac
  for step in 'npx prisma migrate deploy' 'node prisma/run-concurrent.mjs' 'node prisma/verify-schema.mjs'; do
    if printf '%s' "$cmd" | grep -qF "$step"; then
      printf '%s' "$cmd" | grep -qF "DATABASE_URL=\"\$MIGRATE_URL\" $step" \
        || { echo "$f: '$step' does not run with DATABASE_URL=\$MIGRATE_URL" >&2; exit 1; }
    fi
  done
done
echo "run-migrations.test: all passed ($(echo "$tf" | wc -l | tr -d ' ') steps)"
