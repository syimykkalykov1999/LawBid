#!/usr/bin/env bash
# Seeds a migrated, EMPTY load-test database with the repo generators scaled
# by S (scale_sql.py) and run in parallel (par_seed.py):
#   S=1 = 100k users (repo size), S=10 = profile "1M", S=100 = profile "10M".
#   seed.sh <S> <db> [workers]    (Postgres container lawbid-lt-postgres-1)
set -euo pipefail
S="$1"; DB="$2"; W="${3:-8}"
here="$(cd "$(dirname "$0")" && pwd)"
repo="${REPO:-$(cd "$here/../.." && pwd)}"
PG=lawbid-lt-postgres-1
work="${RESULTS:-$HOME/loadtest/results}/seed-sql-s$S"; mkdir -p "$work"
for f in scripts/ops/admin-load-gen.sql scripts/ops/user-load-gen.sql; do
  python3 "$here/scale_sql.py" "$S" "$repo/$f" > "$work/$(basename "$f")"
done
t0=$(date +%s)
for f in admin-load-gen.sql user-load-gen.sql; do
  echo "== $f  $(date +%T)"
  python3 "$here/par_seed.py" "$DB" "$work/$f" "$W"
done
echo "== loadtest-extra.sql  $(date +%T)"
docker exec -i $PG psql -U root -d "$DB" -v ON_ERROR_STOP=1 -q < "$repo/loadtest/sql/loadtest-extra.sql"
docker exec -i $PG psql -U root -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL
GRANT USAGE ON SCHEMA public TO lawbid_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lawbid_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO lawbid_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO lawbid_app;
VACUUM (ANALYZE);
SQL
echo "== done in $(( $(date +%s) - t0 )) s; size: $(docker exec $PG psql -U root -d "$DB" -tAc "select pg_size_pretty(pg_database_size('$DB'))")"
