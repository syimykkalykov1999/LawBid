#!/usr/bin/env bash
# Seeds a migrated, EMPTY database for the user-facing perf guard
# (test/perf-user.e2e-spec.ts) with the repo's deterministic generators:
#   scripts/ops/admin-load-gen.sql   100 000 people, 300 000 posts, 50 000 cases, 150 000 bids
#   scripts/ops/user-load-gen.sql    follows, likes, reels, 50 000 chats / 1 M messages, 1 M notifications
#   loadtest/sql/loadtest-extra.sql + loadtest/local-docker/licenses.sql  v4 ids, licences, practices
#   scripts/ops/social-load-gen.sql  replies, groups, channels, stories, calls, contacts, files (last)
#
#   apps/api/scripts/perf-user-seed.sh "$DATABASE_URL"
#
# PERF_SEED_SCALE=S multiplies every generator by S (loadtest/local-docker/scale_sql.py;
# S=1 is ~1.5 GB on disk, mind the 8 GB free-disk rule on the Mac).
# The admin generator's 200 000 audit rows are skipped: no user screen reads
# them, and the append-only audit trigger makes them the slowest part.
set -euo pipefail
DB="${1:?database url}"
DB="${DB%%\?*}"   # psql does not take Prisma's ?schema=public
S="${PERF_SEED_SCALE:-1}"
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
for f in scripts/ops/admin-load-gen.sql scripts/ops/user-load-gen.sql \
         loadtest/sql/loadtest-extra.sql loadtest/local-docker/licenses.sql scripts/ops/social-load-gen.sql; do
  out="$work/$(basename "$f")"
  if [ "$S" != 1 ] && [ "${f#scripts/ops/}" != "$f" ]; then
    python3 "$repo/loadtest/local-docker/scale_sql.py" "$S" "$repo/$f" > "$out"
  else
    cp "$repo/$f" "$out"
  fi
  # drop the audit_log statement (from its INSERT to the closing semicolon)
  awk '/^INSERT INTO audit_log/{skip=1} !skip{print} skip&&/;[[:space:]]*$/{skip=0}' "$out" > "$out.tmp" && mv "$out.tmp" "$out"
  echo "== $f $(date +%T)"
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "$out" > /dev/null
done
psql "$DB" -tAc "ANALYZE; SELECT 'database size ' || pg_size_pretty(pg_database_size(current_database()))"
