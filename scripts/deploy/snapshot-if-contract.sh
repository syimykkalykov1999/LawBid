#!/usr/bin/env sh
# S11-14: a migration that contracts the schema (drops or rewrites something the
# previous release read) cannot be undone by the one-button rollback, so a named
# RDS snapshot is taken first. A migration is "contract" when its SQL carries the
# waiver line `-- migration-safety: contract <why>` (apps/api/scripts/check-migrations.mjs).
#
#   snapshot-if-contract.sh <from-ref> <to-ref>
# <from-ref> = the release running now (SSM last_good_tag, a commit SHA); empty or
# unknown => every waiver-carrying migration newer than nothing counts, i.e. a
# snapshot is taken (the safe side). Needs a full git history (fetch-depth 0).
#   DB_INSTANCE_ID  default lawbid-prod-postgres
#   SNAPSHOT_WAIT_SECONDS  default 1500
# Prints `snapshot=<id>` on the last line when one was taken.
set -eu
FROM="${1:-}"; TO="${2:?to-ref}"
ID="${DB_INSTANCE_ID:-lawbid-prod-postgres}"
DIR=apps/api/prisma/migrations
if [ -n "$FROM" ] && git rev-parse --verify -q "$FROM^{commit}" >/dev/null; then
  FILES=$(git diff --name-only --diff-filter=AM "$FROM" "$TO" -- "$DIR" | grep 'migration.sql$' || true)
else
  echo "::notice::previous release unknown: treating every contract migration as new"
  FILES=$(git ls-tree -r --name-only "$TO" -- "$DIR" | grep 'migration.sql$' | tail -n 20 || true)
fi
CONTRACT=""
for F in $FILES; do
  if git show "$TO:$F" | grep -Eiq '^--[[:space:]]*migration-safety:[[:space:]]*contract'; then CONTRACT="$CONTRACT $F"; fi
done
if [ -z "$CONTRACT" ]; then echo "no contract migration in this release: no snapshot needed"; exit 0; fi
echo "contract migration(s):$CONTRACT"
SNAP="pre-migrate-$(printf '%.9s' "$TO")-$(date -u +%Y%m%d%H%M)"
aws rds create-db-snapshot --db-instance-identifier "$ID" --db-snapshot-identifier "$SNAP" >/dev/null
echo "snapshot started: $SNAP, waiting until it is available"
if ! timeout "${SNAPSHOT_WAIT_SECONDS:-1500}" aws rds wait db-snapshot-available --db-snapshot-identifier "$SNAP"; then
  echo "::error::snapshot $SNAP is not available in time; not migrating"; exit 1
fi
echo "snapshot=$SNAP"
