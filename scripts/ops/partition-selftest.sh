#!/bin/sh
# End-to-end test of the online table conversion on a throw-away PostgreSQL 16
# (docker). Starts a container, runs the integration spec, removes it.
#   sh scripts/ops/partition-selftest.sh
set -eu
NAME=lawbid-partition-selftest
PORT=${PARTITION_TEST_PORT:-55433}
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=t -p "$PORT:5432" postgres:16 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
i=0
until docker exec "$NAME" pg_isready -U postgres -d t >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 40 ] && { echo "postgres did not start" >&2; exit 1; }
  sleep 1
done
sleep 2
cd "$(dirname "$0")/../../apps/api"
PARTITION_TEST_URL="postgresql://postgres:pw@localhost:$PORT/t" npx jest src/partitioning
