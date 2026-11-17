#!/usr/bin/env bash
# Повторяемые доказательства исправлений по аудиту чатов, файлов, звонков и групп (17.11).
# Запуск из корня репозитория (по одному шагу, память >= 45 %):
#   docs/dev/verify/audit-fixes-2026-11-17/run.sh storage   # PR «хранилище»: пункты 1, 11, 12, 13, 16
#   docs/dev/verify/audit-fixes-2026-11-17/run.sh cleanup   # удалить e2e-базу и очистить Valkey db 13
# Живая часть: e2e поднимает API на случайном порту, ходит в него по HTTP (REST),
# пишет в настоящие PostgreSQL, Valkey и MinIO из docker (lawbid-postgres-1, lawbid-redis-1, lawbid-minio-1).
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

case "${1:-storage}" in
storage)
  cd "$API" || exit 1
  [ -d src/generated/prisma ] || "$HEAVY" -- npx prisma generate
  need_ram
  # Модульные: ожидается всё зелёное (до исправления красные: 1 + 7 тестов).
  "$HEAVY" -- npm test -- --maxWorkers=1 \
    src/modules/groups/groups.remove-file.spec.ts \
    src/modules/files/upload-limits.spec.ts src/modules/files/files.service.spec.ts \
    src/modules/files/jobs/file-scan.processor.spec.ts src/modules/files/jobs/file-scan.runner.spec.ts
  need_ram
  # Живые через API + MinIO: файл удалённого «для всех» сообщения группы уходит
  # из MinIO сразу; чистильщик собирает файлы удалённых сообщений группы и
  # отозванных 1:1 (до исправления оба теста красные: deleted_reason = null).
  E2E_ISOLATION=$TAG E2E_REDIS_DB=$REDIS_DB "$HEAVY" -- npm run test:e2e -- \
    --maxWorkers=1 test/owner-storage.e2e-spec.ts test/owner-chat-actions.e2e-spec.ts
  ;;
cleanup)
  for db in $(docker exec lawbid-postgres-1 psql -U root -d postgres -Atc \
      "SELECT datname FROM pg_database WHERE datname LIKE 'lawbid_e2e_${TAG}_%'"); do
    echo "drop $db"; docker exec lawbid-postgres-1 psql -U root -d postgres -c "DROP DATABASE \"$db\" WITH (FORCE)"
  done
  docker exec lawbid-redis-1 redis-cli -n $REDIS_DB FLUSHDB
  ;;
*) echo "storage | cleanup"; exit 2 ;;
esac
