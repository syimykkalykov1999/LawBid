#!/usr/bin/env bash
# Проверки по коду для аудита 17.11. Ничего не запускает, только читает файлы.
# Каждая строка печатает «ДА» (находка подтверждена на этом коммите) или «НЕТ»
# (код уже другой: находку надо перепроверить). Ожидаемый вывод на 552578d97: все «ДА».
set -u
R="${1:-.}"
A="$R/apps/api/src"
M="$R/apps/mobile"
pass=0; fail=0
has() { # has <id> <описание> <файл> <regex>
  if grep -Eq -- "$4" "$3" 2>/dev/null; then echo "ДА  $1 $2"; pass=$((pass+1));
  else echo "НЕТ $1 $2 ($3)"; fail=$((fail+1)); fi
}
lacks() { # lacks <id> <описание> <файл> <regex> [<от строки> <до строки>]
  local body
  if [ $# -ge 6 ]; then body=$(sed -n "$5,$6p" "$3"); else body=$(cat "$3"); fi
  if echo "$body" | grep -Eq -- "$4"; then echo "НЕТ $1 $2 ($3)"; fail=$((fail+1));
  else echo "ДА  $1 $2"; pass=$((pass+1)); fi
}
fn() { # тело функции: fn <файл> <начало regex> -> печатает 60 строк от начала
  local n; n=$(grep -nE -- "$2" "$1" | head -1 | cut -d: -f1); [ -n "$n" ] && sed -n "${n},$((n+60))p" "$1"
}
fnlacks() { # fnlacks <id> <описание> <файл> <начало функции> <regex, которого нет>
  if fn "$3" "$4" | grep -Eq -- "$5"; then echo "НЕТ $1 $2 ($3)"; fail=$((fail+1));
  else echo "ДА  $1 $2"; pass=$((pass+1)); fi
}

echo "== Путь данных =="
has D1 "файлы < 8 МБ при confirm читаются API целиком" "$A/modules/files/files.policy.ts" "LIGHT_CONFIRM_MIN_BYTES = 8 \* 1024 \* 1024"
has D1b "...и кладутся обратно в хранилище через API (storage.put)" "$A/modules/files/files.service.ts" "await this.storage.put\(intent.bucket, key, directData"
has D1c "...и копия байтов ложится в Valkey для проверки" "$A/modules/files/files.service.ts" "handoff\?\.stash\(fileId, directData\)"
has D2 "превью ссылок: sharp внутри API" "$A/modules/link-preview/link-preview-image.service.ts" "^import sharp from 'sharp'"
# Приём файла через сервер есть только в двух админских импортах (переводы, рассылки), не для медиа людей.
up=$(grep -rlE 'FileInterceptor|@UploadedFile' "$A" | grep -v '\.spec\.ts' | sed "s#$A/##" | sort | tr '\n' ' ')
if [ "$up" = "modules/i18n/controllers/i18n-admin.controller.ts modules/outreach/admin-outreach.controller.ts " ]; then
  echo "ДА  D3 файлы людей идут мимо API; через сервер только 2 админских импорта: $up"; pass=$((pass+1))
else echo "НЕТ D3 список приёмов файлов через сервер изменился: $up"; fail=$((fail+1)); fi
has D4 "фото чата 1600 px / 82 зашиты в коде приложения" "$M/lib/core/media/photo_limits.dart" "1600"

echo "== Файлы =="
fnlacks F1 "удаление сообщения группы «для всех» не освобождает файл" "$A/modules/groups/groups.service.ts" "async remove\(" "release|FileRelease"
has F1b "чистильщик считает файл занятым любой строкой группы, даже удалённой" "$A/modules/storage/storage-cleanup.service.ts" "FROM chat_group_messages cgm WHERE cgm.file_id = f.id\)"
has F1c "в 1:1 удаление файл освобождает" "$A/modules/chat/chat-actions.service.ts" "releaseFile"
has F2 "голосовые: ссылка на 1 час (зашито)" "$A/modules/files/files.policy.ts" "MEDIA_SIGNED_URL_TTL_SEC"
lacks F2b "chat_voice нет в списке конфиденциальных (журнал просмотров)" "$A/modules/files/file-access.service.ts" "chat_voice"
has F3 "веб-голосовое без AAC уходит как WebM (нет перекодировки на сервере)" "$M/lib/features/chat/application/chat_media_outbox.dart" "webm|WebM"
has F4 "кэш медиа чатов на телефоне: предел по штукам, не по байтам" "$M/lib/core/media/app_image_cache.dart" "1000"

echo "== Чаты 1:1 =="
has C1 "догонялка afterId: не больше 100 и nextCursor: null" "$A/modules/chat/chat.service.ts" "const CATCH_UP_MAX = 100"
has C1b "...сортировка и курсор по created_at, а не по seq" "$A/modules/chat/chat.service.ts" "created_at: \{ gt: anchor.created_at \}"
has C2 "правка: предел 2000 знаков зашит, а отправка читает настройку" "$A/modules/chat/chat-actions.service.ts" "length > MESSAGE_MAX_CHARS"
has C2b "...отправка: настройка limits.chat_message_chars" "$A/modules/chat/chat.service.ts" "chat_message_chars"
fnlacks C3 "«печатает…» не проверяет блок" "$A/modules/realtime/realtime.gateway.ts" "private relayTyping\(" "[Bb]lock"
has C4 "rt:fx:pending — общий ключ без срока" "$A/modules/chat/chat.service.ts" "rt:fx:pending"

echo "== Звонки 1:1 =="
has K1 "проверка «занят» и создание звонка без замка" "$A/modules/calls/calls.service.ts" "if \(await this.liveCallOf\(callee\)\)"
has K2 "уборка звонков внутри accept/get" "$A/modules/calls/calls.service.ts" "await this.sweepIfDue\(\);"
has K3 "по умолчанию не только Cloudflare: calls.transport = auto" "$A/common/app-settings/app-settings.defaults.ts" "'calls.transport': 'auto'"
has K3b "...и свой TURN = auto" "$A/common/app-settings/app-settings.defaults.ts" "'calls.own_turn.mode': 'auto'"
has K4 "iOS: длина звонка 60 с зашита, ringSeconds не читается" "$M/ios/Runner/AppDelegate.swift" "data.duration = 60000"
has K5 "кэш TURN-ключей: при 5000 стирается целиком" "$A/modules/calls/cloudflare-turn.ts" "cache.size >= CACHE_MAX\) cache.clear\(\)"
has K6 "TURN-ключ живёт 24 ч (зашито)" "$A/modules/calls/calls.service.ts" "TURN_TTL_SEC"

echo "== Группы =="
has G1 "раздача сообщений группы: 8 частей, по 1 на часть на весь кластер" "$A/modules/groups/group-fanout.queue.ts" "GROUP_FANOUT_PARTITIONS = 8"
has G1b "...setGlobalConcurrency(1)" "$A/modules/groups/group-fanout.queue.ts" "setGlobalConcurrency\(1\)"
lacks G2 "жалобы: нет типа group / group_message" "$R/apps/api/prisma/schema.prisma" "^  group(_message)?$" 695 720
has G3 "SFU: дорожка cam разрешена без проверки call.video" "$A/modules/calls/sfu-broker.service.ts" "allow only .mic. / .cam."
has G4 "значок: публикация на каждого участника отдельно" "$A/modules/notifications/badges.service.ts" "toUsers\(\[id\], 'badge:update'"
has G5 "Valkey лёг: лимит сообщений бросает ошибку (нет catch)" "$A/modules/auth/services/rate-limit.service.ts" "async consumeFixedWindow"

echo "== Перемены (ARM, Spot) =="
has R1 "прод на ARM64 и Spot (api, worker, admin, pgbouncer)" "$R/infra/envs/prod/growth.auto.tfvars.json" "\"pgbouncer_spot\": true"
has R2 "ClamAV-образ мультиархитектурный 1.4" "$R/infra/modules/ecs/main.tf" "clamav/clamav-debian:1.4"

echo "итого: ДА=$pass НЕТ=$fail"
