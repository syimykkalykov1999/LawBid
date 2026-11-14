#!/usr/bin/env bash
# Offline tests for wait-data-stores-idle.sh (no AWS).
set -euo pipefail
cd "$(dirname "$0")"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
check() { if [ "$1" = "$2" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $3 (got $1, want $2)"; fi; }
run() { DATA_STORES_FAKE_DIR="$T" DATA_STORES_WAIT_SECONDS=0 DATA_STORES_POLL_SECONDS=0 sh ./wait-data-stores-idle.sh lawbid-prod >/dev/null 2>&1 && echo 0 || echo 1; }

echo "available 0" > "$T/lawbid-prod-postgres.json"
echo "available 0" > "$T/lawbid-prod-redis.json"
check "$(run)" 0 "everything available, shards and cache absent: go"
echo "modifying 0" > "$T/lawbid-prod-postgres.json"
check "$(run)" 1 "the database is being resized: wait, then fail"
echo "available 1" > "$T/lawbid-prod-postgres.json"
check "$(run)" 1 "a pending modification on the database: wait"
echo "available 0" > "$T/lawbid-prod-postgres.json"
echo "modifying 0" > "$T/lawbid-prod-cache-redis.json"
check "$(run)" 1 "the cache Redis is being resized: wait"
echo "available 0" > "$T/lawbid-prod-cache-redis.json"
echo "error AccessDenied" > "$T/lawbid-prod-db1-postgres.json"
check "$(run)" 0 "a refused read only warns (not strict)"
check "$(DATA_STORES_STRICT=true run)" 1 "a refused read fails when strict"

echo "pass=$pass fail=$fail"; [ "$fail" = 0 ]
