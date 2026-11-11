# Свои бэкапы базы (свои серверы) — pgBackRest

Для переезда с AWS (план: `docs/architecture/SELF_HOSTING_INVENTORY_2026-10-28.md`, строка 10). На AWS бэкапы делает RDS/AWS Backup; на своих серверах — pgBackRest (MIT, пакеты PostgreSQL проекта) в своё хранилище MinIO.

## Проверено 10.11.2026 (стенд на ноуте)
1. База Postgres 16 + `archive_mode=on`, `archive_command=pgbackrest --stanza=lawbid archive-push %p`.
2. 100 000 строк → `stanza-create` → `backup --type=full` (3 с) в MinIO по https.
3. Ещё 500 строк после копии → `pg_switch_wal()` → `check`.
4. Новая ПУСТАЯ база → `restore` → запуск: 100 500 строк, md5 всех строк совпал с исходной (`05b69799…`). Строки, записанные после копии, вернулись из журнала.

## Как включить
- Образ: `infra/selfhost/backups/Dockerfile`; настройки: `pgbackrest.conf.example` (ключи — только переменные окружения; шифрование копии `repo1-cipher-type`, пароль `PGBACKREST_REPO1_CIPHER_PASS`).
- Postgres: `-c archive_mode=on -c wal_level=replica -c "archive_command=pgbackrest --stanza=lawbid archive-push %p"`.
- Один раз: `pgbackrest --stanza=lawbid stanza-create`.
- Расписание (cron/systemd): полная — воскресенье 06:00, разностная — каждый день 06:00 (`--type=diff`); хранение как сейчас на RDS — 14 дней.
- Вторая копия в другом месте: второй `repo2-*` (другой сайт/провайдер).

## Восстановление (учения раз в месяц, как на AWS)
1. Новая пустая база, тот же образ.
2. `pgbackrest --stanza=lawbid restore` (на секунду: `--type=time --target="2026-11-10 18:00:00-08"`).
3. Запустить, сверить `count(*)` и md5 ключевых таблиц, удалить учебную базу.
