#!/usr/bin/env bash
# Повторяемые доказательства аудита чатов, файлов, звонков и групп (17.11).
# Запуск из корня репозитория:
#   docs/dev/verify/chats-calls-groups/run.sh code     # проверки по коду (секунды, ничего не запускает)
#   docs/dev/verify/chats-calls-groups/run.sh specs    # точечные jest-тесты (через heavy.sh, по одному)
#   docs/dev/verify/chats-calls-groups/run.sh order    # проба П1 на настоящей PostgreSQL (e2e-база)
#   docs/dev/verify/chats-calls-groups/run.sh cleanup  # удалить e2e-базу пробы и очистить Valkey db 14
# Правила Мака: по одному шагу, память >= 45 %, --maxWorkers=1.
set -u
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
API="$ROOT/apps/api"
HEAVY="${HEAVY:-/Users/sima/Desktop/LawBid/scripts/dev/heavy.sh}"
export PATH=/opt/homebrew/opt/node@26/bin:$PATH
TAG=ccgaudit
REDIS_DB=14

need_ram() {
  local free
  free=$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2);print int($2)}')
  echo "free RAM: ${free:-?} %"
  if [ -n "$free" ] && [ "$free" -lt 45 ]; then echo "память < 45 %: стоп"; exit 3; fi
}

case "${1:-code}" in
code)
  exec bash "$(dirname "$0")/code-checks.sh" "$ROOT"
  ;;
specs)
  need_ram
  cd "$API" || exit 1
  # Без созданного клиента Prisma тесты падают «Cannot find module '../generated/prisma/client'».
  [ -d src/generated/prisma ] || "$HEAVY" -- npx prisma generate
  # Группа 1: чаты и сокеты
  "$HEAVY" -- npm test -- --maxWorkers=1 \
    src/modules/chat/chat-redeliver.spec.ts src/modules/chat/chat-read-receipt.spec.ts \
    src/modules/chat/chat-block-actions.spec.ts src/modules/chat/disappearing-sweep.service.spec.ts \
    src/modules/chat/chat-list-catch-up.spec.ts src/modules/realtime/realtime.gateway.caps.spec.ts \
    src/modules/realtime/realtime-event-log.spec.ts
  need_ram
  # Группа 2: файлы
  "$HEAVY" -- npm test -- --maxWorkers=1 \
    src/modules/files/upload-limits.spec.ts src/modules/files/jobs/file-scan.processor.spec.ts \
    src/modules/files/files.policy.r2.spec.ts src/modules/files/multipart.spec.ts \
    src/modules/files/files.multipart.spec.ts src/modules/files/magic-bytes.spec.ts
  need_ram
  # Группа 3: звонки и пуши
  "$HEAVY" -- npm test -- --maxWorkers=1 \
    src/modules/calls/call-cancel-ring-status.spec.ts src/modules/calls/call-end-idempotent.spec.ts \
    src/modules/calls/calls-sweep-throttle.spec.ts src/modules/calls/turn-urls.spec.ts \
    src/modules/calls/cloudflare-turn.spec.ts src/modules/calls/call-history-etag.spec.ts \
    src/modules/calls/call-history-delta.spec.ts src/modules/notifications/push/apns-voip.sender.spec.ts
  need_ram
  # Группа 4: группы и групповые звонки
  "$HEAVY" -- npm test -- --maxWorkers=1 \
    src/modules/groups/groups.message-limit.spec.ts src/modules/groups/groups.membership-room.spec.ts \
    src/modules/groups/group-fanout.queue.spec.ts src/modules/groups/groups.fanout.spec.ts \
    src/modules/groups/groups.voice.spec.ts src/modules/calls/calls-group-flag.spec.ts \
    src/modules/calls/call-removed-member-token.spec.ts src/modules/calls/calls-failover.spec.ts
  ;;
order)
  need_ram
  # e2e читает apps/api/.env (DATABASE_URL, REDIS_URL локальных docker-баз). В worktree: ссылка на .env основной папки.
  [ -e "$API/.env" ] || { echo "нет $API/.env: ln -s /Users/sima/Desktop/LawBid/apps/api/.env $API/.env"; exit 2; }
  mkdir -p "$API/test/_audit"
  cp "$(dirname "$0")/order.e2e-spec.ts" "$API/test/_audit/order.e2e-spec.ts"
  sed -i '' "s#'../src/#'../../src/#g" "$API/test/_audit/order.e2e-spec.ts"
  cd "$API" || exit 1
  E2E_ISOLATION=$TAG E2E_REDIS_DB=$REDIS_DB "$HEAVY" -- npm run test:e2e -- \
    --maxWorkers=1 test/_audit/order.e2e-spec.ts
  rc=$?
  rm -rf "$API/test/_audit"
  exit $rc
  ;;
cleanup)
  for db in $(docker exec lawbid-postgres-1 psql -U root -d postgres -Atc \
      "SELECT datname FROM pg_database WHERE datname LIKE 'lawbid_e2e_${TAG}_%'"); do
    echo "drop $db"; docker exec lawbid-postgres-1 psql -U root -d postgres -c "DROP DATABASE \"$db\" WITH (FORCE)"
  done
  docker exec "$(docker ps --format '{{.Names}}' | grep -iE 'redis|valkey' | head -1)" redis-cli -n $REDIS_DB FLUSHDB
  ;;
*) echo "usage: $0 code|specs|order|cleanup"; exit 2;;
esac
