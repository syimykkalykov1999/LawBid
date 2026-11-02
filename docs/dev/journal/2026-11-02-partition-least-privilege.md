# 2026-11-02 — роль lawbid_partition с наименьшими правами

- Миграция `20261112110000_partition_role_least_privilege`: роль владеет только тремя партиционируемыми таблицами и ссылающимися на них, без доступа к audit_log/case_journal/user_consents/users; `lawbid_migrator` — участник роли.
- Тест `apps/api/src/partitioning/partition-privilege.int.spec.ts` (нужны PARTITION_REAL_URL / PARTITION_REAL_SEED, свежая БД с миграциями): 4 теста на локальном PG16.
- `partition_role_enabled` остаётся `false` по умолчанию (пустой секрет ломает запуск задачи ECS).
