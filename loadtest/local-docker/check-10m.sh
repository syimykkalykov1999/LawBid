#!/usr/bin/env bash
# One command: is the 10M database healthy for the hot read paths?
#   check-10m.sh [<fixtures dir>]      (RUN_R1K=1 + fixtures dir: also the r1k rung on 10M)
#   DB=lawbid_lt10  PG_CONTAINER=lawbid-lt-postgres-1  RESULTS=~/loadtest/results
# 1. starts the stack's Postgres/Redis if they are only stopped (`docker start`)
# 2. row counts must be >= 95 % of the 10M profile (users 10M, posts 30M,
#    messages 100M, notifications 100M)
# 3. EXPLAIN (ANALYZE, BUFFERS) of the hot reads (explain_10m.py): a Seq Scan
#    on a big table, a slow page or a cold read is a FINDING
# 4. optionally the r1k rung (ladder.sh) and the Seq Scan counters it leaves
# Exit: 0 pass, 1 findings, 2 no 10M data (see RESEED below), 3 the check itself failed.
#
# RESEED (only with the OWNER'S «да»: ~8.5 h, 205 GB on disk, the laptop is busy):
#   DEFER_INDEXES=1 ./seed.sh 100 lawbid_lt10 8     # then licenses.sql, prepare.sh
# Never `docker compose down -v` this stack before the findings are written
# to docs/perf: the volume IS the 10M database.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PG="${PG_CONTAINER:-lawbid-lt-postgres-1}"; export PG_CONTAINER="$PG"
res="${RESULTS:-$HOME/loadtest/results}/check-10m-$(date +%m%d-%H%M)"; mkdir -p "$res"
for c in "$PG" lawbid-lt-redis-1; do
  [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = true ] || docker start "$c" >/dev/null 2>&1 || true
done
if ! docker inspect "$PG" >/dev/null 2>&1; then
  echo "no Postgres container $PG: the 10M stand is gone. RESEED needs the owner's «да» (see the header)."; exit 2
fi
for _ in $(seq 1 60); do docker exec "$PG" pg_isready -U root >/dev/null 2>&1 && break; sleep 2; done
psqlq() { docker exec "$PG" psql -U root -d "${DB:-postgres}" -tAq -c "$1"; }
if [ -z "${DB:-}" ]; then   # the biggest lawbid_lt* database
  DB="$(docker exec "$PG" psql -U root -d postgres -tAq -c \
    "select datname from pg_database where datname like 'lawbid_lt%' order by pg_database_size(datname) desc limit 1")"
fi
[ -n "$DB" ] || { echo "no lawbid_lt* database in $PG: RESEED needs the owner's «да»"; exit 2; }
export DB
echo "== database $DB, $(psqlq "select pg_size_pretty(pg_database_size('$DB'))")"
bad=0
rows() {  # <table>: the table plus its partitions, from the catalog (count(*) over 100M rows is minutes)
  psqlq "select coalesce(sum(greatest(c.reltuples,0)),0)::bigint from pg_class c
         where c.oid = '$1'::regclass or c.oid in (select inhrelid from pg_inherits where inhparent = '$1'::regclass)"
}
for spec in users:10000000 posts:30000000 messages:100000000 notifications:100000000; do
  t="${spec%%:*}"; want="${spec##*:}"
  have="$(rows "$t")"
  if [ "${have:-0}" -le 0 ]; then psqlq "analyze $t" >/dev/null 2>&1; have="$(rows "$t")"; fi  # never analysed: reltuples is -1/0
  have="${have:-0}"
  printf '%-14s %12s of %s\n' "$t" "$have" "$want"
  [ "$have" -ge $((want * 95 / 100)) ] || { echo "  FINDING: $t is below 95 % of the profile"; bad=1; }
done
echo "== EXPLAIN of the hot reads"
python3 "$here/explain_10m.py" "$DB" "$res/explain.json" | tee "$res/explain.txt"
case "${PIPESTATUS[0]}" in
  0) ;;
  1) bad=1 ;;
  2) echo "the 10M database has no messages/notifications to sample: RESEED needs the owner's «да»"; exit 2 ;;
  *) echo "explain_10m.py itself failed (not a finding): see $res/explain.txt"; exit 3 ;;
esac
if [ "${RUN_R1K:-0}" = 1 ] && [ -n "${1:-}" ]; then
  stack_db="$(grep -oE '/lawbid_lt[a-z0-9_]*' "${STACK:-$HOME/loadtest/stack}/api.env" 2>/dev/null | head -1 | tr -d /)"
  if [ "$stack_db" != "$DB" ]; then
    echo "r1k would hit '${stack_db:-?}' (the stack's api.env), not '$DB': point the stack at $DB first (round2.sh use_db)"; exit 3
  fi
  echo "== r1k on 10M"
  mark="$res/.r1k-start"; touch "$mark"
  "$here/ladder.sh" "$1" r1k | tee "$res/r1k.txt"; [ "${PIPESTATUS[0]}" -eq 0 ] || bad=1
  last="$(find "${RESULTS:-$HOME/loadtest/results}" -maxdepth 1 -type d -name '*r1k*' -newer "$mark" 2>/dev/null | sort | tail -1)"
  if [ -n "$last" ] && [ -f "$last/seqscans.txt" ]; then
    cp "$last/seqscans.txt" "$res/"
    # the tables and their partitions (a partition has its own counters)
    if awk -F'|' 'NR==FNR {big[$1]=1; next} ($1 in big) && $3 > 10000000 {f=1} END {exit !f}' "$res/explain.json.big" "$last/seqscans.txt"; then
      echo "FINDING: Seq Scan read > 10M rows of a big table during r1k ($last/seqscans.txt)"; bad=1
    fi
  else
    echo "no seqscans.txt from the r1k run: the Seq Scan counters were not checked"; bad=1
  fi
fi
echo "== $([ $bad = 0 ] && echo PASS || echo FINDINGS) -> $res"
exit $bad
