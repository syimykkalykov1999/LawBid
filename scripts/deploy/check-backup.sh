#!/usr/bin/env sh
# docs/06 §6.4 "перед каждой продовой миграцией схемы проверяется, что
# свежий бэкап создан": the managed PostgreSQL host's latest automated
# snapshot must be younger than 26 hours.
#
# The production host is not chosen yet (owner decision, docs/runbooks/
# PROD_LAUNCH.md), so there is no provider API to ask. Until then this only
# warns and exits 0. Once the host is chosen, point it at its API, e.g. AWS
# RDS:  aws rds describe-db-instances --query 'DBInstances[0].LatestRestorableTime'
# (the in-app hourly check, ops-guard.job.ts, is re-pointed the same way).
set -eu
if [ -z "${DB_BACKUP_LATEST_ISO:-}" ]; then
  echo "::warning::database backup freshness not verified (no provider configured yet)"
  exit 0
fi
LATEST=$(node -e 'console.log(Date.parse(process.argv[1])||0)' "$DB_BACKUP_LATEST_ISO")
AGE_H=$(( ( $(date +%s) * 1000 - LATEST ) / 3600000 ))
echo "latest backup: ${AGE_H}h ago"
[ "$LATEST" != "0" ] && [ "$AGE_H" -le 26 ]
