#!/usr/bin/env bash
# Повторяемые доказательства: PR «звонки» по аудиту 17.11 (пункты 5, 6, 14).
# Запуск из корня репозитория (по одному шагу, память >= 45 %):
#   docs/dev/verify/audit-fixes-2026-11-17/calls.sh          # модульные + живые e2e
#   docs/dev/verify/audit-fixes-2026-11-17/calls.sh explain  # индексы на e2e-базе и план запроса уборки
#   docs/dev/verify/audit-fixes-2026-11-17/calls.sh cleanup  # удалить e2e-базу и очистить Valkey db 13
# Живая часть (e2e): API на случайном порту, тестовые адвокат и клиенты звонят
# одновременно (по 5 кругов): до исправления 2 звонка «звонит», после — 1.
set -u
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
API="$ROOT/apps/api"
HEAVY="$ROOT/scripts/dev/heavy.sh"
export PATH=/opt/homebrew/opt/node@26/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=8192
TAG=audfix
REDIS_DB=13

need_ram() {
  local free
  free=$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2);print int($2)}')
  echo "free RAM: ${free:-?} %"
  if [ -n "$free" ] && [ "$free" -lt 45 ]; then echo "память < 45 %: стоп"; exit 3; fi
}

e2e_db() {
  docker exec lawbid-postgres-1 psql -U root -d postgres -Atc \
    "SELECT datname FROM pg_database WHERE datname LIKE 'lawbid_e2e_${TAG}_%' LIMIT 1"
}

case "${1:-run}" in
run)
  cd "$API" || exit 1
  [ -d src/generated/prisma ] || "$HEAVY" -- npx prisma generate
  need_ram
  # До исправления: 2 красных (камера в аудиозвонке группы → не 403).
  "$HEAVY" -- npm test -- --maxWorkers=1 \
    src/modules/calls/sfu-broker.spec.ts src/modules/calls/sfu-calls.spec.ts
  need_ram
  # До исправления: 2 красных (Expected: 1, Received: 2 звонящих звонка).
  E2E_ISOLATION=$TAG E2E_REDIS_DB=$REDIS_DB "$HEAVY" -- npm run test:e2e -- \
    --maxWorkers=1 test/owner-call-busy-race.e2e-spec.ts test/owner-calls.e2e-spec.ts
  ;;
explain)
  db=$(e2e_db)
  [ -n "$db" ] || { echo "нет e2e-базы: сначала run"; exit 2; }
  for f in "$API"/prisma/concurrent/20261218*.sql; do
    docker exec -i lawbid-postgres-1 psql -U root -d "$db" < "$f"
  done
  docker exec lawbid-postgres-1 psql -U root -d "$db" -c "SET enable_seqscan = off;" \
    -c "EXPLAIN SELECT id FROM calls WHERE status = 'active' AND updated_at < now() - interval '3 minutes' LIMIT 200;"
  ;;
cleanup)
  for db in $(docker exec lawbid-postgres-1 psql -U root -d postgres -Atc \
      "SELECT datname FROM pg_database WHERE datname LIKE 'lawbid_e2e_${TAG}_%'"); do
    echo "drop $db"; docker exec lawbid-postgres-1 psql -U root -d postgres -c "DROP DATABASE \"$db\" WITH (FORCE)"
  done
  docker exec lawbid-redis-1 redis-cli -n $REDIS_DB FLUSHDB
  ;;
*) echo "run | explain | cleanup"; exit 2 ;;
esac
