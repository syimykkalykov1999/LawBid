# 03.11 Воркер партиций: $2::int

Баг с прода (Mac, 03:06 UTC): `PartitionService.maintain()` передавал число в `lawbid_ensure_month_partitions` / `lawbid_detach_old_partitions` как bigint (так Prisma биндит JS number), а функции принимают `(text, integer)` — Postgres не находил сигнатуру, ежедневная поддержка партиций (data_access_log, post_view_events, audit_log, auth_events) падала с 02:40 UTC. Исправление: `$1::text, $2::int` в обоих запросах. Тест: `partition.service.spec.ts` проверяет явные касты.

Состояние: PR в ветке claude/project-thread-g12o43; деплойный (apps/api). Не проверено: живой прогон на прод-БД (после деплоя смотреть лог воркера «maintain»).
