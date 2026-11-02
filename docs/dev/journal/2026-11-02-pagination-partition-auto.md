# 2026-11-02 — курсор для отзывов о клиентах, деление таблиц по умолчанию «auto»

- `client-reviews.service.ts`: сортировки highest/lowest/helpful листаются ключевым курсором (`ranked-cursor`), число из старого приложения читается как раньше.
- `partition.messages_mode`, `partition.chat_group_messages_mode`, `partition.notifications_mode`: по умолчанию `auto` (старт на `partition.auto_rows`, 50 млн). Нужен секрет `PARTITION_DATABASE_URL`, без него ничего не происходит.
- Аудит: `docs/perf/PAGINATION_AND_PARTITION_AUDIT_2026-11-02.md`.
