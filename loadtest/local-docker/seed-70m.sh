#!/usr/bin/env bash
# Seeds a NEW database with ~70 million users (S=700 of the repo generators).
# It does NOT top up the 10M database: the generators are deterministic and keyed by the row
# number with "modulo the population" constants, so S=700 builds a different, consistent data set
# (running it over the 10M rows would mix two populations). The 10M database stays untouched.
#
#   seed-70m.sh --check                       only the disk arithmetic, starts nothing
#   seed-70m.sh --go [<db> [<workers>]]       the real run (default db lawbid_lt70, 8 workers)
#
# Only on the owner's word and with the laptop on (about 10 times the 10M run: roughly 3 days).
# Disk: ~20 GB per million users by our 10M measure (205 GB per 10M) = ~1.4 TB, +15 % for the
# index build at the end. Refuses to start without that room; while it runs a watcher stops
# the seed (kills the seed processes, leaves the data as is) when free space on the Docker
# volume falls under 10 % of the disk.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mode="${1:---check}"; DB="${2:-lawbid_lt70}"; W="${3:-8}"
PGC="${PG_CONTAINER:-lawbid-lt-postgres-1}"
[[ "$DB" =~ ^[a-z][a-z0-9_]{0,40}$ ]] || { echo "bad database name: $DB"; exit 2; }
[[ "$W" =~ ^[0-9]+$ ]] || { echo "bad workers: $W"; exit 2; }
GB_PER_M="${GB_PER_M:-20.5}"; USERS_M=70; MIN_FREE_PCT=10
need_gb=$(python3 -c "print(int($GB_PER_M*$USERS_M*1.15))")
dir="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"; [ -d "$dir" ] || dir="$HOME"
read -r total_kb free_kb < <(df -Pk "$dir" | awk 'NR==2{print $2, $4}')
total_gb=$((total_kb/1048576)); free_gb=$((free_kb/1048576))
keep_gb=$((total_gb*MIN_FREE_PCT/100))
echo "disk ($dir): total ${total_gb} GB, free ${free_gb} GB; need ${need_gb} GB + keep ${keep_gb} GB (10 %) free"
if [ $((free_gb)) -lt $((need_gb+keep_gb)) ]; then
  echo "NOT ENOUGH DISK: free ${free_gb} GB < $((need_gb+keep_gb)) GB. Free space (the 10M database is ~205 GB: drop it ONLY with the owner's word) or attach a bigger disk."
  exit 3
fi
[ "$mode" = --go ] || { echo "disk is enough; run with --go to start"; exit 0; }
docker inspect "$PGC" >/dev/null 2>&1 || { echo "no Postgres container $PGC"; exit 2; }
docker exec "$PGC" psql -U root -d postgres -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1 \
  && { echo "database $DB already exists: refusing to touch it"; exit 2; }
docker exec "$PGC" psql -U root -d postgres -q -c "CREATE DATABASE $DB" || exit 1
( cd "$here/../../apps/api" && DATABASE_URL="postgresql://root:lawbid@localhost:5432/$DB?sslmode=disable" npx prisma migrate deploy >/dev/null ) || { echo "migrate failed"; exit 1; }

# watcher: every 60 s; under 10 % free = stop the seed
( while sleep 60; do
    f=$(df -Pk "$dir" | awk 'NR==2{print $4}'); t=$(df -Pk "$dir" | awk 'NR==2{print $2}')
    if [ $((f*100/t)) -lt $MIN_FREE_PCT ]; then
      echo "!! free disk under ${MIN_FREE_PCT} %: stopping the seed (data left as is, $DB incomplete)"
      pkill -f "par_seed.py $DB" ; pkill -f "indexes.py create $DB"; pkill -P $$ -f seed.sh
      exit
    fi
  done ) &
watch=$!
trap 'kill $watch 2>/dev/null' EXIT
DEFER_INDEXES=1 SEED_PGOPTIONS='-c enable_hashjoin=off -c work_mem=256MB' "$here/seed.sh" 700 "$DB" "$W"
rc=$?
echo "seed exit $rc; then: licenses.sql, prepare.sh (as for 10M, see check-10m.sh header), check-10m.sh with DB=$DB"
exit $rc
