# Миграция упала или застряла (P3009)

Когда читать: шаг «Migrations» в Deploy красный, в логе `P3009`,
`migrate found failed migrations` или `the migration ran longer than 1800s`.
Прод-приложение при этом **продолжает работать на старой версии**: сервисы
катятся только после зелёной миграции.

## Что произошло простыми словами

Миграция — один SQL-файл, который меняет базу. Если он оборвался посередине
(таймаут, нет места, ручная остановка), Prisma пишет в таблицу
`_prisma_migrations` строку «failed» и **не запускает следующие миграции**, пока
человек не скажет, что с этой строкой делать. Это защита, а не поломка.

## Шаги (Claude делает по просьбе «миграция упала», вы только подтверждаете 2FA)

1. Не нажимайте Re-run. Сначала убедитесь, что задача остановлена:
   AWS Console → ECS → cluster `lawbid-prod` → Tasks → фильтр `lawbid-prod-migrate`.
   Если есть RUNNING — Stop. (Скрипт деплоя сам останавливает задачу через 30 минут
   и не запускает вторую, пока первая жива.)
2. Посмотреть состояние: `scripts/deploy/prod-run.sh <тег> migrate-status`
   (только чтение; показывает применённые, упавшие и ожидающие миграции).
3. Понять, что успело примениться. SQL-файл в одной транзакции
   (`apps/api/prisma/migrations/<имя>/migration.sql`): оборвалось — значит ничего
   из него не применилось, выбирайте `rolled-back`. Файл с `CREATE INDEX
   CONCURRENTLY` (папка `prisma/concurrent`) идёт вне транзакции: проверьте
   индекс, недостроенный индекс помечен INVALID, его нужно `DROP INDEX
   CONCURRENTLY` и собрать заново.
4. Пометить:
   - откатилась целиком: `prod-run.sh <тег> migrate-resolve <имя_миграции> rolled-back`
   - на самом деле применилась (все изменения видны в базе): `... applied`
5. Запустить Deploy заново (Run workflow с тем же тегом). Миграция выполнится
   с нуля (rolled-back) или пропустится (applied).

## Если миграция просто долгая

Индекс на большой таблице строится минуты. Это не падение: ждите до 30 минут
(лимит `MIGRATE_TIMEOUT_SECONDS`). Дольше — миграция остановится сама, и такую
операцию надо переписать как `prisma/concurrent` или батчами (см. ONLINE_DDL.md,
когда он появится в main).

## Перед ручным вмешательством

Свежий снимок: деплой с миграциями «contract» делает его сам
(`aws rds create-db-snapshot`, шаг «Snapshot before contract migrations»).
Проверка вручную: RDS → Databases → `lawbid-prod-postgres` → Maintenance & backups →
Latest restore time.

English: `migrate-resolve` = Prisma `migrate resolve --applied|--rolled-back`,
run inside the released API image against the migrator role; the script asks you
to retype the migration name.

## Schema check (сверка базы со схемой после миграций)

С 2026-10-27 migrate-задача после `prisma migrate deploy` и
`run-concurrent.mjs` запускает `prisma/verify-schema.mjs`: настоящая база
должна совпасть со `schema.prisma` нового образа (та же проверка, что в CI,
но на проде). Если нет — выкладка **останавливается до** запуска новой
версии; старая продолжает работать (все миграции расширяющие).

Что значит красный шаг «Migrations» с текстом `schema check: the database
differs`:
1. Чаще всего — защищённая миграция пропустила работу (таблица была занята
   или большая). Пример: `20261107131300_partition_messages_notifications`
   пишет NOTICE `composite keys SKIPPED`. Решение: в тихое время выполнить
   `SELECT lawbid_messages_composite_keys();` (или с лимитом строк, см.
   [table-partitioning.md](table-partitioning.md)) и перезапустить Deploy.
2. Реже — кто-то менял базу руками. Список таблиц/колонок — в логе шага.
   Вернуть как в схеме или, если изменение нужно, оформить миграцией.
3. Осознанно пропустить проверку один раз: переменная GitHub
   `SCHEMA_DRIFT_CHECK=warn` (Settings → Secrets and variables → Actions →
   Variables), после выкладки удалить. `off` — не использовать.
