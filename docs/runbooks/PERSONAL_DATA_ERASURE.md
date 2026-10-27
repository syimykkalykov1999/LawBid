# Удаление личных данных (реестр хранилищ)

Что это: в коде есть один список всех мест, где живут данные человека
(`apps/api/src/modules/privacy/personal-data-registry.ts`). При удалении
аккаунта (через 14 дней после запроса) система проходит по списку во ВСЕХ
базах данных и во внешних хранилищах, записывает результат по каждому
пункту и выдаёт сертификат удаления.

Результаты лежат в таблице `deletion_steps` (её ведёт PR #360, privacy
hardening: этот PR вливать ПОСЛЕ #360): по строке `store:<имя>` на каждое
хранилище и строка `certificate` с сертификатом.

## Что происходит автоматически

- Базы: личные таблицы человека чистятся в каждой физической базе.
- Файлы в S3/R2 удаляются вместе с копиями-превью; общие файлы (одинаковая
  загрузка у другого человека) остаются у другого.
- Видео Bunny, push-токены, ключи Redis, поисковый индекс (OpenSearch, если
  включён) — чистятся.
- Деньги (платежи, звёзды, комиссии партнёров, начисления) и журналы
  (audit, входы, согласия, журнал дел) НЕ удаляются: по закону хранятся,
  пользователь внутри них уже обезличен.
- Юридическая блокировка (legal hold) останавливает удаление до снятия.
- Если какой-то шаг упал, задача повторяется; уже сделанные шаги не
  повторяются.

## Где смотреть результат

Админка → запросы данных → «Удаление аккаунта» (`GET
/admin/data-requests/legal/erasure/:userId`): статус, результат по каждому
хранилищу и сертификат (номер, дата, контрольная сумма).

## Кэш CDN

Шаг `cdn_cache` отдаёт список ключей файлов в общий «инвалидатор CDN»
(`apps/api/src/common/cdn`). Пока инвалидатор не подключён, шаг в
сертификате будет «not_configured»: файлов в хранилище уже нет, кэш истечёт
сам. Ничего настраивать не нужно.

## Резервные копии

Копии базы (RDS snapshots) стареют сами по сроку хранения; удаление «в
копиях» не делается. Правило: после восстановления из копии нужно заново
прогнать удаление для аккаунтов с сертификатами (строки `deletion_steps` и `erasure_ledger`, они же в бакете, покажут, кого).

## Регион данных

Колонка `users.home_region` (по умолчанию `us`) и `shard_map.region` —
задел под хранение данных по странам. Сейчас ни на что не влияет.

## Источники (проверено 2026-10-25)

- EDPB, отчёт по скоординированной проверке права на удаление (Art. 17),
  февраль 2026: https://www.edpb.europa.eu/news/edpb-identifies-challenges-hindering-the-full-implementation-of-the-right-to-erasure_en
- Reed Smith, ключевые выводы отчёта EDPB 2025 по Art. 17:
  https://www.reedsmith.com/our-insights/blogs/viewpoints/102mm9l/edpb-report-on-the-right-to-erasure-key-takeaways-from-the-2025-coordinated-enfo/
- McCann FitzGerald, Delete and Disclose: EDPB CEF 2025 & 2026:
  https://www.mccannfitzgerald.com/knowledge/data-privacy-and-cyber-risk/delete-and-disclose-edpb-cef-2025-2026
- Red Gate Simple Talk, "It's 2026. Why are databases still failing GDPR
  compliance audits?": https://www.red-gate.com/simple-talk/data-security-privacy-compliance/its-2026-why-are-databases-still-failing-gdpr-compliance-audits/
