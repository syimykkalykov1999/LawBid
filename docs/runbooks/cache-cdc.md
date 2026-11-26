# Сброс кэша по журналу базы (C2)

Второй путь сброса кэша. Первый остаётся как был: код сам удаляет ключ Valkey, когда пишет в базу. Второй читает журнал изменений PostgreSQL (логическая репликация, встроенный `pgoutput`) и удаляет те же ключи, даже если строку поменяли мимо приложения: SQL в консоли, перенос частей базы, задача, которая забыла сбросить кэш.

Так делают большие платформы:
- Facebook, «Scaling Memcache at Facebook» (NSDI 2013, §4.1 «Regional Invalidations»): демоны mcsqueal читают журнал коммитов MySQL и рассылают удаления в memcache. https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala
- Uber CacheFront (15.02.2024): сброс кэша по журналу изменений базы, 99,99 % согласованности. https://www.uber.com/blog/how-uber-serves-over-40-million-reads-per-second-using-an-integrated-cache
- AWS, «Best practices for Amazon RDS for PostgreSQL replication slots»: следить за `OldestReplicationSlotLag`, удалять брошенные места чтения, иначе кончится диск.

Готовые части (правило № 1): клиент логической репликации `pg-logical-replication` 2.6.0 (MIT, https://github.com/kibae/pg-logical-replication), протокол `pgoutput` из PostgreSQL. Debezium Server (Apache-2.0) не взят: это отдельная Java-служба и ещё одна очередь (Kafka / Redis Streams) ради того же результата; у нас читатель — уже работающий воркер.

## Как устроено

- Публикация `lawbid_cache_cdc` (миграция `20261223120000_cache_cdc_publication`): 16 таблиц из `apps/api/src/modules/cache-cdc/cdc-key-map.ts` (`CDC_TABLES`). Пять маленьких таблиц (`subscriptions`, `contract_grants`, `user_consents`, `user_strikes`, `assistant_memberships`) переведены в `REPLICA IDENTITY FULL`: при удалении строки журнал несёт `user_id`, иначе не узнать, чей кэш сбросить.
- Воркер (`CacheCdcService`) раз в 30 секунд читает переключатель, проверяет базу, создаёт место чтения `lawbid_cache_cdc` и читает поток. Одно место на сервер базы; если воркеров несколько, читает один, остальные ждут (`standby`).
- Позиция в журнале подтверждается только после того, как ключи удалены (хотя бы один раз; повторное удаление безвредно).
- Карта «таблица → ключи» в одном месте; тест `cdc-key-map.spec.ts` запускает настоящие функции сброса модулей и проверяет, что оба пути удаляют одно и то же.

## Переключатели (админка → Настройки)

| Ключ | По умолчанию | Что делает |
|---|---|---|
| `db.cdc_mode` | Выкл | Выкл — не читает, своё место чтения удаляет. Вкл — читает; если база не готова, лампа жёлтая. Авто — читает, как только база готова (логическая репликация, публикация, право `rds_replication`). |
| `db.cdc_max_slot_wal_mb` | 2048 | Защита диска: место чтения, которое держит больше стольких МБ журнала (или потеряно), удаляется и создаётся заново. Кэши за промежуток доживают свой срок (1–5 минут). 0 — только потерянное. |
| `db.cdc_lag_alarm_sec` | 120 | Лампа жёлтая, когда изменение ждёт сброса дольше. |

Состояние: «Здоровье системы» → «Сброс кэша по журналу базы».

## Тревоги (CloudWatch, `infra/modules/monitoring/db-health.tf`)

- `…-cache-cdc-lag`: задержка больше 5 минут 10 минут подряд.
- `…-cache-cdc-slot-dropped`: защита пересоздала место чтения.
- `…-replication-slot-lag` (RDS `OldestReplicationSlotLag` > 4096 МБ): любое место репликации держит много журнала. Сразу: `db.cdc_mode` → Выкл (наше место удалится в течение минуты). Если не наше (обновление базы Blue/Green, перенос частей) — смотреть их инструкции.

## Шаги владельца (в конце)

1. `database_logical_replication = true`. С 26.11 его ставит «Авто» само (строка `aws.db_logical_replication` на «Масштабе», `infra.mode.db_logical_replication`): когда API хочет не меньше `infra.cdc_prepare_on_api_tasks` (4) серверов; план меняет только группы параметров базы и применяется сам (`infra-auto-growth.logic.ts`). Само не выключается (снять параметр может только `ResetDBParameterGroup`, KNOWN_ERRORS 173). По желанию `database_max_slot_wal_keep_size_mb = 20480` в `terraform.tfvars` (встроенная защита PostgreSQL, место чтения старше 20 ГБ журнала помечается потерянным).
2. В воскресное окно перезагрузить базу (`rds.logical_replication` применяется только после перезагрузки): AWS Console → **RDS** → **Databases** → `lawbid-prod-postgres` → **Actions** → **Reboot** (с Multi-AZ — **Reboot with failover**).
3. Дать пользователю приложения право читать журнал. AWS Console → **RDS** → **Query Editor** (или psql под главным пользователем) → выполнить: `GRANT rds_replication TO lawbid_app;`
4. Админка → Настройки → `db.cdc_mode` → **Авто**. Через минуту «Здоровье системы» → «Сброс кэша по журналу базы» — зелёная, «работает».

Если отдельная вторая база (`DB_SHARD_HOSTS`) появится, шаги 1–3 нужны и для неё; воркер читает её сам.

## Проверка на своём компьютере

```
docker run -d --name cdc-pg -p 55433:5432 -e POSTGRES_PASSWORD=pw postgres:18.6 -c wal_level=logical
docker run -d --name cdc-valkey -p 56380:6379 valkey/valkey:9.1.3-alpine
cd apps/api
CDC_PG_TEST_URL=postgresql://postgres:pw@127.0.0.1:55433/postgres \
CDC_REDIS_TEST_URL=redis://127.0.0.1:56380 npx jest cache-cdc.integration
docker rm -f cdc-pg cdc-valkey
```

## Что не покрыто

- Жёсткое удаление строки `posts` / `users` (журнал несёт только `id`): такой ключ доживает свой срок (60 с). Обычно посты удаляются мягко (`UPDATE`), это покрыто.
- Таблицы, которых нет в карте (сообщения, уведомления), — только первый путь, как раньше.
- Массовое изменение больше 200 000 разных ключей в одной транзакции: лишние ключи доживают свой срок (`overflows` в состоянии).
