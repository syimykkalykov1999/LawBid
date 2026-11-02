# 02.11 Сверка масштаба по коду + пробелы

ECS растёт по числу сокетов на задачу (`api_sockets`, OpenSockets в runtime-метриках); реплика БД создаётся сама после 3 ч CPU основной базы ≥ 75 % (`db.replica_provision`, не удаляет, нужен `db_replica_toggle`). Сверка: `docs/perf/SCALE_EFFICIENCY_AUDIT_2026-11-02.md`. OpenSearch остаётся Частично. PR ветки claude/project-thread-80636b — в CI.
