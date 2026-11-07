# 2026-11-03 — i18n: новые ключи не доходили до прода (KNOWN_ERRORS №48)

Ветка claude/i18n-bundle-missing-keys (от origin/main 0f8aa0ce1).

- Факт: бандл `ky` = 4692 строки, сид = 6368; одинаково для en/ru/ky/es, не хватает 1680 ключей (group, channel, notif, consult, chat, cases…).
- Причина: импорт `--missing-only` в одноразовой задаче ECS убивался по памяти (в логе «Killed», нет строки `dry-run:`), код возврата терялся в `| cut`, шаг зелёный.
- Правка: `I18nImportService.run` сравнивает с БД кусками по 400 ключей (select key + lang/value); `prod-admin-ecs.sh` (i18n, i18n-full) сохраняет код node и ставит кучу 1400 МиБ; тест на 1000 ключей.
- Версия бандла и кэш: apply и так повышает `i18n_bundle_versions` для затронутых языков и пишет версию в Redis; ETag зависит от версии. Отдельной инвалидации не нужно.
- После слияния: deploy.yml сам запустит `i18n` на следующем деплое. Чтобы не ждать — `scripts/deploy/prod-admin-ecs.sh <tag> i18n` (CLUSTER=lawbid-prod).
- Совмещение с #700: там в том же цикле добавлен `admin_edited`; после слияния #700 в `select` нужно добавить `admin_edited: true` (конфликт в одном блоке, логика сохраняется).
