# Сжатие раздутых таблиц: pg_repack на RDS

Когда: лампочка «База» в «Здоровье системы» жёлтая с `bloatOver` (раздутие > 30 % у большой горячей таблицы), или таблица заметно больше, чем должна быть. Устройство проверки: [ONLINE_DDL.md §4](../architecture/ONLINE_DDL.md). **Автоматически pg_repack не запускается никогда**: это решение человека, в тихое время.

Источник: AWS, «Reducing bloat in tables and indexes with the pg_repack extension»
(https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.pg_repack.html),
GitHub reorg/pg_repack, PostgreSQL pgstattuple.

## 0. Сначала проверьте, что это правда раздутие

```sql
-- расширение один раз (под rds_superuser, не миграция):
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT * FROM pgstattuple_approx('public.messages');   -- dead_tuple_percent + approx_free_percent
SELECT avg_leaf_density, leaf_fragmentation FROM pgstatindex('public.messages_pkey'); -- ~90 = здорово
```

Раздутие часто лечится без repack: если мёртвых строк много, а автовакуум отстал, смотрите `pg_stat_user_tables.last_autovacuum`. Свободное место внутри таблицы переиспользуется новыми строками; repack нужен, когда место нужно **вернуть** (диск, кэш, медленные сканы) или раздут индекс. Для одного индекса достаточно `REINDEX INDEX CONCURRENTLY имя;` (PostgreSQL 12+, без блокировки записи, нужен файл в `prisma/concurrent/` или ручная команда).

## 1. Условия

| Что | Требование |
|---|---|
| Ключ | у таблицы есть PRIMARY KEY или UNIQUE по NOT NULL (иначе repack откажется) |
| Расширение | `CREATE EXTENSION pg_repack;` в нужной базе, под `rds_superuser`; затем права на служебные таблицы: `ALTER DEFAULT PRIVILEGES IN SCHEMA repack GRANT INSERT ON TABLES TO PUBLIC; ALTER DEFAULT PRIVILEGES IN SCHEMA repack GRANT USAGE, SELECT ON SEQUENCES TO PUBLIC;` |
| Версия клиента | утилита `pg_repack` должна быть **той же версии**, что расширение на сервере (`SELECT extversion FROM pg_extension WHERE extname='pg_repack';`). Версия не совпала = ошибка «program and extension versions do not match». Какие версии поддерживает ваша версия RDS PostgreSQL, смотрите в Release Notes RDS |
| Место на диске | свободного места (`FreeStorageSpace` в CloudWatch) должно быть **больше размера таблицы без раздутия** (таблица + индексы + TOAST минус мусор), потому что строится полная копия. Размер: `SELECT pg_size_pretty(pg_total_relation_size('public.messages'));` Диск RDS растёт сам (storage autoscaling), но не мгновенно: запас с избытком |
| Мощность | нужен запас CPU и IOPS; в пик нагрузки не запускать. Окно: ночь по Чикаго (как у автомасштабирования базы 03:30, не пересекайтесь с ним: `docs/runbooks/db-autoscale.md`, на время repack держите `db-autoscale` в режиме `off`) |
| Выкладки | не запускать во время выкладки и миграций |
| Реплики | repack пишет много WAL: следите за `ReplicaLag` реплики чтения |
| Пользователь | учётная запись с `rds_superuser` (например master user); не `lawbid_app`. Секреты — в Secrets Manager, в чат/историю не писать |

## 2. Где запускать

Клиенту нужен доступ к базе по сети и нужная версия утилиты. База в приватной подсети, поэтому из ECS-задачи: одноразовая задача на образе с `postgresql-client` и `pg_repack` нужной версии (в образе API их нет, надо собрать отдельный маленький образ или использовать Cloud Shell/бастион VPC). Не открывайте базу в интернет. Пароль подавайте через переменную окружения `PGPASSWORD` из секрета задачи.

## 3. Команды (RDS)

Нужен ключ `-k` (RDS не даёт суперпользователя, без него утилита не стартует); ключ `-a` на RDS не поддерживается.

```sh
# сначала посмотреть, что будет сделано, ничего не меняя
pg_repack -h $HOST -U $USER -d lawbid -k --dry-run --table public.messages

# одна таблица с индексами; не убивать чужие сессии, ждать до 60 с блокировку
pg_repack -h $HOST -U $USER -d lawbid -k --table public.messages \
  --wait-timeout=60 --no-kill-backend

# только индексы таблицы (раздут индекс, таблица нормальная; быстрее и меньше места)
pg_repack -h $HOST -U $USER -d lawbid -k --table public.messages --only-indexes
```

Один раз — одна таблица. Не гоните все горячие таблицы подряд.

## 4. Блокировки и риски

- Большую часть времени нужна только `ACCESS SHARE` (чтение исходной таблицы), запись идёт как обычно. Короткая `ACCESS EXCLUSIVE` (секунды) нужна дважды: при создании журнала изменений и в самом конце при замене таблицы. Если в это время идёт долгий запрос или открытая транзакция на таблице, repack ждёт, а за ним встают **все** запросы таблицы. Поэтому `--wait-timeout` и проверка `pg_stat_activity` перед стартом:
  ```sql
  SELECT pid, now()-xact_start AS age, state, left(query,80) FROM pg_stat_activity
  WHERE xact_start IS NOT NULL ORDER BY xact_start LIMIT 10;
  ```
- Очень высокая скорость записи в таблицу: повтор накопленных изменений может не успеть. Тогда `--only-indexes` или повторить в тихий час.
- Диск растёт на размер копии до самой замены. Следите: `FreeStorageSpace`, размер журнала `SELECT relname, n_live_tup FROM pg_stat_all_tables WHERE schemaname='repack' AND relname ILIKE '%log%';`.
- Если repack оборвали: исходная таблица не пострадала (операция вне места); временные объекты остаются в схеме `repack`. Исправление по документации AWS: `DROP EXTENSION pg_repack CASCADE; CREATE EXTENSION pg_repack;` в этой базе, затем повторить. Лишние индексы `index_NNN` и таблицы `repack.table_NNN` до этого могут занимать место.
- Проверка после: `pgstattuple_approx` снова; лампочка станет зелёной после ближайшей ночной проверки (03:35 UTC) или завтра.

## 5. Если не получается

Не форсируйте. Таблицу можно оставить как есть (место переиспользуется), увеличить диск, или запланировать окно. На вопрос «можно ли убить чужие сессии» ответ по умолчанию нет; `pg_terminate_backend` только осознанно, если блокирует конкретная старая сессия.
