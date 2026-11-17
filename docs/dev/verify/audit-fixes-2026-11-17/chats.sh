#!/usr/bin/env bash
# Повторяемые доказательства: PR «чаты и группы» по аудиту 17.11 (пункты 2, 4, 7, 9).
# Запуск из корня репозитория (по одному шагу, память >= 45 %):
#   docs/dev/verify/audit-fixes-2026-11-17/chats.sh          # модульные + живые e2e
#   docs/dev/verify/audit-fixes-2026-11-17/chats.sh cleanup  # удалить e2e-базу и очистить Valkey db 13
# Живая часть (e2e): API на случайном порту, двое тестовых людей (клиент и адвокат),
# настоящие PostgreSQL и Valkey из docker. В выводе строки AUDIT_P9 — «было / стало»
# для значков группы на 5000 человек.
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

case "${1:-run}" in
run)
  cd "$API" || exit 1
  [ -d src/generated/prisma ] || "$HEAVY" -- npx prisma generate
  need_ram
  # До исправления: 9 красных (Valkey 3, «печатает…» при блоке, значки пачкой, части раздачи).
  "$HEAVY" -- npm test -- --maxWorkers=1 \
    src/modules/auth/services/rate-limit.fallback.spec.ts \
    src/modules/realtime/realtime.gateway.caps.spec.ts \
    src/modules/realtime/realtime-publisher.each.spec.ts \
    src/modules/groups/group-fanout.queue.spec.ts \
    src/modules/notifications/badges.messages-arrived.spec.ts
  need_ram
  # До исправления: 2 красных (101 сообщение → 409; правка и удаление старых догоняются).
  E2E_ISOLATION=$TAG E2E_REDIS_DB=$REDIS_DB "$HEAVY" -- npm run test:e2e -- \
    --maxWorkers=1 test/owner-chat-catchup.e2e-spec.ts test/stage-5-7.e2e-spec.ts
  ;;
cleanup)
  for db in $(docker exec lawbid-postgres-1 psql -U root -d postgres -Atc \
      "SELECT datname FROM pg_database WHERE datname LIKE 'lawbid_e2e_${TAG}_%'"); do
    echo "drop $db"; docker exec lawbid-postgres-1 psql -U root -d postgres -c "DROP DATABASE \"$db\" WITH (FORCE)"
  done
  docker exec lawbid-redis-1 redis-cli -n $REDIS_DB FLUSHDB
  ;;
*) echo "run | cleanup"; exit 2 ;;
esac
