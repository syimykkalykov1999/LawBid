#!/usr/bin/env bash
# CONTENT_MEDIA_VERIFY 17.11 №1: e2e on prod's engines — PostgreSQL 18.6 + Valkey 9.1.3,
# the same digest-pinned images as CI. Own throw-away containers on 55432 / 56380:
# the shared dev containers (lawbid-postgres-1, lawbid-redis-1) are not touched.
#   docs/dev/verify/engines-pg18-valkey9.sh [suite ...]     (default: the 5 suites below)
#   docs/dev/verify/engines-pg18-valkey9.sh --down          remove the two containers
# Expected (17.11): «PostgreSQL 18.6 …», «valkey_version:9.1.3», Tests: 44 passed, 44 total
set -euo pipefail
PG=postgres:18.6@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42
VK=valkey/valkey:9.1.3-alpine@sha256:bf09d58e96d6b4524a15396b65b242bbe18beebbcc15a04d8ee75ddac62fae0b
if [ "${1:-}" = --down ]; then docker rm -f cmvfix-pg18 cmvfix-valkey; exit 0; fi
cd "$(dirname "$0")/../../../apps/api"
docker inspect cmvfix-pg18 >/dev/null 2>&1 || docker run -d --name cmvfix-pg18 -e POSTGRES_USER=root \
  -e POSTGRES_PASSWORD=lawbid -e POSTGRES_DB=lawbid -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 "$PG"
docker inspect cmvfix-valkey >/dev/null 2>&1 || docker run -d --name cmvfix-valkey -p 127.0.0.1:56380:6379 "$VK"
until docker exec cmvfix-pg18 pg_isready -U root -d lawbid >/dev/null 2>&1; do sleep 1; done
docker exec cmvfix-pg18 psql -U root -d lawbid -tAc "select version()"
docker exec cmvfix-valkey valkey-cli info server | grep valkey_version
docker exec cmvfix-pg18 psql -U root -d lawbid -tAc "select 1 from pg_database where datname='lawbid_test'" | grep -q 1 \
  || docker exec cmvfix-pg18 psql -U root -d lawbid -c "create database lawbid_test"
export PATH=/opt/homebrew/opt/node@26/bin:$PATH
free=$(memory_pressure | awk -F': ' '/free percentage/{gsub("%","",$2);print int($2)}')
[ "$free" -ge 45 ] || { echo "RAM $free % < 45 % — not starting"; exit 3; }
set -a; . ./.env.test; set +a
export DATABASE_URL="postgresql://root:lawbid@127.0.0.1:55432/lawbid_test?schema=public"
export REDIS_URL="redis://127.0.0.1:56380" E2E_ISOLATION=pg18 E2E_REDIS_DB=12
S="${*:-files owner-blocks stage-5-2 stage-6-6 owner-storage}"
P=""; for s in $S; do P="$P test/$s.e2e-spec.ts"; done
../../scripts/dev/heavy.sh -- npm test -- --config test/jest-e2e.json --maxWorkers=1 $P 2>&1 \
  | grep -E "^(PASS|FAIL)|Tests:|Test Suites:|●" || true
