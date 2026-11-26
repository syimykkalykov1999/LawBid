# Миграции базы под узкой ролью `lawbid_migrator` (D8)

owner: владелец нажимает «Вкл» у переключателя и вводит код 2FA (один раз).

Источник: `docs/dev/SECOND_PASS_2026-11-26.md`, строка D8. AWS Well-Architected SEC03-BP02 («Grant least privilege access») и документация Amazon RDS «Master user account privileges»: главного пользователя базы не давать программам, для каждой работы своя роль.

## Как устроено

- Задача миграций (`<cluster>-migrate`) держит главного пользователя RDS `lawbid_admin` (секрет `MIGRATOR_DATABASE_URL`, как раньше).
- Переключатель админки **`aws.db_migrator_role`** (Terraform `db_migrator_role_enabled`, файл `infra/envs/prod/growth.auto.tfvars.json`):
  - **Выкл** (по умолчанию): миграции идут под `lawbid_admin`, ровно как до D8;
  - **Вкл**: Terraform даёт задаче секрет `MIGRATOR_ROLE_PASSWORD` (пароль сгенерирован Terraform, `random_password.migrator`, лежит только в состоянии Terraform и в Secrets Manager `lawbid-prod/MIGRATOR_ROLE_PASSWORD`). Первым шагом задача запускает `apps/api/prisma/ensure-migrator-role.mjs` под `lawbid_admin`: файл `apps/api/prisma/migrator-role.sql` создаёт или сужает роль, передаёт ей таблицы, затем пароль, проверка и вход под ролью. Всё в порядке: `prisma migrate deploy`, `prisma/run-concurrent.mjs` и `prisma/verify-schema.mjs` идут под `lawbid_migrator`.
- Под `lawbid_admin` при любом положении остаются: пароли ролей (`prisma/ensure-partition-login.mjs`; узкая роль не может менять роли) и дополнительные серверы базы (`prisma/migrate-shards.mjs`, у каждого свой главный пользователь).
- Если при Вкл что-то не готово (таблица занята дольше 3 секунд пять раз подряд, роль получила лишнее право, вход не прошёл), задача пишет `migrator role: FALLBACK ...`, миграции этого запуска идут под `lawbid_admin`, выкладка не падает, а в журнале деплоя появляется предупреждение. Следующий запуск пробует снова.
- Первая установка на пустую базу (нет `_prisma_migrations`): первые миграции идут под `lawbid_admin` (они создают роли), со следующего запуска под `lawbid_migrator`.

## Права роли `lawbid_migrator`

| Есть | Нет |
|---|---|
| LOGIN, владелец таблиц, представлений, последовательностей, типов и функций схемы `public` | SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS |
| USAGE и CREATE на схеме `public`; CONNECT и CREATE на базе (CREATE нужен владельцу публикации `lawbid_cache_cdc` и доверенным расширениям pg_trgm / unaccent) | членство в `rds_superuser` и в `lawbid_admin` |
| член `lawbid_partition_tables` (как в миграции 20261112110000) | владение самой базой: удалить базу роль не может |
| `lock_timeout = 5s`, `statement_timeout = 10min` | создавать роли и менять пароли |

Новые таблицы роли сами дают `lawbid_app` чтение и запись, а последовательности использование (`ALTER DEFAULT PRIVILEGES FOR ROLE lawbid_migrator`, копия прав по умолчанию главного пользователя).

Честное ограничение: владелец таблицы в PostgreSQL может читать её целиком, так что `lawbid_migrator` видит все столбцы, включая секретные. Схему без чтения данных PostgreSQL не умеет; закрыто тем, что роль живёт только в задаче миграций.

Не `REASSIGN OWNED`: он отдал бы роли и саму базу (тогда она могла бы её удалить) и расширения. Каждый `ALTER ... OWNER` идёт отдельно, одна блокировка за раз (шаблон psql `\gexec`).

## Шаги владельца

1. Админка → «Масштаб» (или «Расходы») → строка «Миграции базы под узкой ролью (lawbid_migrator)» → **Вкл**.
2. Через 2–5 минут откроется план: меняются только задача миграций (`aws_ecs_task_definition.migrate`) и право этой задачи читать один секрет; ничего не удаляется, сервисы не перезапускаются. Подтвердить кодом 2FA.
3. Workflow `infra-apply` сам запускает задачу миграций («Migrate now»): роль готова за секунды.

## Как проверить

- В журнале запуска `infra-apply` (шаг «Migrate now») есть строка `migrator role: ready, migrations run as lawbid_migrator` и нет предупреждения `migrations ran as the master user`.
- Следующая выкладка (`deploy.yml`, шаг миграций) пишет ту же строку.
- CI: шаг «Migrations run as the narrow role lawbid_migrator (D8)» в `api-ci.yml` делает то же на свежей базе и проверяет права (`apps/api/scripts/migrator-role-probe.mjs`).

## Откат

Админка → та же строка → **Выкл** → код 2FA. Задача миграций снова идёт под `lawbid_admin`; ничего не удаляется (секрет остаётся). `lawbid_admin` — член `lawbid_migrator` с INHERIT, поэтому все права на таблицы у него сохраняются. Новые таблицы, сделанные при Выкл, при следующем Вкл снова передаются роли.

## Руками (если админка недоступна)

От главного пользователя базы: `psql "$MASTER_URL" -v ON_ERROR_STOP=1 -f apps/api/prisma/migrator-role.sql`, затем `\password lawbid_migrator`. Секрет `MIGRATOR_DATABASE_URL` на `lawbid_migrator` руками не менять: задача сама выбирает роль.
