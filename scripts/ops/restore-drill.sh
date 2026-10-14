#!/usr/bin/env bash
# Zero maintenance (owner 2026-10-05): the quarterly restore drill
# (docs/runbooks/restore-drill.md), automated after the one click that
# only the managed PostgreSQL host's console can do.
#
#   1. Host console → Backups / snapshots → newest one (or point-in-time) →
#      Restore → into a NEW instance (never the live one). Copy its
#      connection string. (Without a managed snapshot: pg_restore a recent
#      `pg_dump -Fc` into an empty scratch database.)
#   2. RESTORED_URL='postgresql://…restored…' PROD_URL='postgresql://…live, read-only role…' \
#        scripts/ops/restore-drill.sh
#
# Checks: the restored database answers, its migrations match the code,
# the main tables have about as many rows as production (a backup is at
# most a day old) and how fresh the newest data is. Prints a
# row for the drill log; delete the scratch instance afterwards (it costs
# money while it exists).
set -euo pipefail
: "${RESTORED_URL:?connection string of the restored scratch instance}"
: "${PROD_URL:?read-only connection string of production}"
START=$(date +%s)
q() { psql "$1" -At -v ON_ERROR_STOP=1 -c "$2"; }

echo "1/4 restored database answers…"
q "$RESTORED_URL" "SELECT 1" >/dev/null

echo "2/4 migrations match…"
want=$(ls -d apps/api/prisma/migrations/2* | wc -l | tr -d ' ')
have=$(q "$RESTORED_URL" "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
echo "   code: $want, restored: $have"
[ "$have" -le "$want" ] && [ "$have" -ge $((want - 5)) ] || { echo "migrations differ too much"; exit 1; }

echo "3/4 row counts vs production…"
latest=""
for t in users cases bids messages subscriptions case_journal; do
  a=$(q "$PROD_URL" "SELECT count(*) FROM $t")
  b=$(q "$RESTORED_URL" "SELECT count(*) FROM $t")
  echo "   $t: prod $a, restored $b"
  # A day-old backup may miss the newest rows, never most of them.
  [ "$a" -eq 0 ] || [ "$((b * 100 / a))" -ge 90 ] || { echo "$t: restored has far fewer rows"; exit 1; }
done
latest=$(q "$RESTORED_URL" "SELECT max(created_at) FROM users")

echo "4/4 newest data in the restore…"
echo "   newest user: $latest, newest journal entry: $(q "$RESTORED_URL" "SELECT max(created_at) FROM case_journal")"

MIN=$(( ( $(date +%s) - START ) / 60 ))
echo
echo "OK. Add this row to docs/runbooks/restore-drill.md:"
echo "| $(date -u +%Y-%m-%d) | newest row $latest | scratch instance | console restore + ${MIN} min checks | ≤ 24 h | rows ok (chain: run journal.chain-verify on staging if needed) | — | $(whoami) |"
echo "Then delete the scratch instance in the host console."
