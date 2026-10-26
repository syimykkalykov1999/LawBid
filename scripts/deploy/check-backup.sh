#!/usr/bin/env sh
# docs/06 §6.4 "перед каждой продовой миграцией схемы проверяется, что
# свежий бэкап создан".
#
# S11-14: the real check. RDS answers `LatestRestorableTime` (the newest point
# a point-in-time restore can reach, advanced every 5 minutes while automated
# backups are on). The deploy fails when it is older than BACKUP_MAX_AGE_HOURS
# (default 26), absent (backups off) or the instance does not exist.
#   DB_INSTANCE_ID    default lawbid-prod-postgres (infra existing_database_identifier)
#   BACKUP_CHECK_STRICT=true  also fail when the API call itself is denied or
#                     errors (default: only warn, so a missing IAM permission
#                     before the Terraform apply does not stop a release).
#   DB_BACKUP_LATEST_ISO  test / non-RDS override: an ISO timestamp is used
#                     instead of asking RDS.
set -eu
MAX_H="${BACKUP_MAX_AGE_HOURS:-26}"
ID="${DB_INSTANCE_ID:-lawbid-prod-postgres}"
LATEST_ISO="${DB_BACKUP_LATEST_ISO:-}"
if [ -z "$LATEST_ISO" ]; then
  if ! LATEST_ISO=$(aws rds describe-db-instances --db-instance-identifier "$ID" \
        --query 'DBInstances[0].LatestRestorableTime' --output text 2>/tmp/backup-check.err); then
    MSG="could not read LatestRestorableTime of $ID: $(tr '\n' ' ' </tmp/backup-check.err | cut -c1-200)"
    if [ "${BACKUP_CHECK_STRICT:-false}" = "true" ]; then echo "::error::$MSG"; exit 1; fi
    echo "::warning::$MSG (set BACKUP_CHECK_STRICT=true once the deploy role has rds:DescribeDBInstances)"
    exit 0
  fi
fi
case "$LATEST_ISO" in ""|None|null) echo "::error::no restorable time for $ID: automated backups are off or the instance is missing"; exit 1 ;; esac
LATEST=$(node -e 'console.log(Date.parse(process.argv[1])||0)' "$LATEST_ISO")
[ "$LATEST" != "0" ] || { echo "::error::unreadable backup time '$LATEST_ISO'"; exit 1; }
AGE_H=$(( ( $(date +%s) * 1000 - LATEST ) / 3600000 ))
echo "latest restorable time of $ID: ${LATEST_ISO} (${AGE_H}h ago, limit ${MAX_H}h)"
if [ "$AGE_H" -gt "$MAX_H" ]; then echo "::error::the newest restorable point is ${AGE_H}h old (limit ${MAX_H}h): docs/runbooks/backup-failed.md"; exit 1; fi
