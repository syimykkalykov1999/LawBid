#!/bin/bash
# pgss_dump.sh <db> <outdir> : top 25 by total and by mean (full text), top 40 by calls, totals
db=$1; out=$2
docker cp "$(dirname "$0")/pgss.sql" ${PG_CONTAINER:-lawbid-lt-postgres-1}:/tmp/pgss.sql
docker exec ${PG_CONTAINER:-lawbid-lt-postgres-1} psql -U root -d $db -q -f /tmp/pgss.sql
for f in total mean calls sum; do docker cp ${PG_CONTAINER:-lawbid-lt-postgres-1}:/tmp/pgss_$f.txt $out/pgss_$f.txt; done
cat $out/pgss_sum.txt
