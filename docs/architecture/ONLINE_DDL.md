# Изменения базы без остановки (online DDL)

**Коротко для владельца (5 строк).**
1. Любое изменение таблицы (индекс, ограничение, новая колонка) теперь проверяется автоматически ещё до слияния: если оно заблокирует большую таблицу, CI не пропустит.
2. Индексы строятся в обход блокировок: отдельные файлы в `prisma/concurrent/` запускаются сразу после обычных миграций и сами чистят недостроенный индекс.
3. Большие переносы данных идут порциями (по 1000 строк, не быстрее 2000 строк в секунду), с паузой/продолжением в админке «Масштаб»; сами притормаживают, если база или реплика заняты.
4. Каждую ночь считаем «раздутие» (мусор) в самых горячих таблицах; если больше 30 %, лампочка «База» становится жёлтой. Сжатие (pg_repack) вручную, по инструкции, само не запускается.
5. Стоит $0 (всё это скрипты и одна ночная проверка), приложение выглядит как раньше.

Исследование (октябрь 2026), что скопировано и откуда:

| Что | Источник |
|---|---|
| Линтер миграций **Squawk** v2.70.0 (15.10.2026), готовое решение, правила `require-concurrent-index-creation`, `constraint-missing-not-valid`, `adding-not-nullable-field`, `changing-column-type`, `adding-field-with-default`, `require-lock-timeout`, `disallowed-unique-constraint` | https://squawkhq.com/docs/rules , https://github.com/sbdchd/squawk |
| Те же проверки в Rails: strong_migrations (индекс, внешний ключ, check, NOT NULL, смена типа, volatile default, lock_timeout, перенос данных порциями с паузами) | https://github.com/ankane/strong_migrations |
| GitLab: `disable_ddl_transaction!` для индексов, внешний ключ NOT VALID + отдельная валидация, `with_lock_retries` (повтор при занятой таблице) | https://docs.gitlab.com/development/migration_style_guide/ |
| GitLab: батчевые фоновые миграции: диапазоны ключей, повторяемость, пауза по сигналам здоровья (автовакуум, WAL, apdex), пауза/продолжение | https://docs.gitlab.com/development/database/batched_background_migrations/ |
| PostgreSQL: `CREATE INDEX CONCURRENTLY` нельзя в транзакции; при сбое остаётся INVALID индекс, его удаляют и строят заново | https://www.postgresql.org/docs/current/sql-createindex.html |
| PostgreSQL `pgstattuple` / `pgstattuple_approx` / `pgstatindex` | https://www.postgresql.org/docs/current/pgstattuple.html |
| AWS: pg_repack на RDS (расширение, версия клиента = версии расширения, место на диске, короткие блокировки) | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.pg_repack.html |

**Какой готовый инструмент взяли и почему.** Проверку миграций делает Squawk (готовый, поддерживается, знает 79 правил Postgres, понимает «таблица создана в этой же миграции»); своего разбора SQL не пишем, только настройка `apps/api/.squawk.toml` и обёртка в `scripts/check-migrations.mjs`. Раздутие меряет расширение Postgres `pgstattuple`, сжимает pg_repack (оба готовые). Своё написано только там, где готового нет: запуск `CONCURRENTLY`-файлов после Prisma (Prisma не умеет) и фреймворк порционных переносов с паузой (в Node/Prisma готового нет; образец: GitLab batched background migrations).

## 1. Правила для новых миграций

Проверка: `node apps/api/scripts/check-migrations.mjs` (шаг в `api-ci.yml`; Squawk ставится там же, версия закреплена). Касается миграций новее `20261102000000`; уже выкаченные не пересматриваются. Prisma выполняет каждый `migration.sql` в одной транзакции, поэтому `assume_in_transaction = true`.

| Нельзя | Как правильно |
|---|---|
| `CREATE INDEX` без `CONCURRENTLY` на существующей таблице | Файл `prisma/concurrent/<14 цифр>_<имя>.sql`, см. §2 |
| `ADD FOREIGN KEY` / `ADD CHECK` без `NOT VALID` | `... NOT VALID` в одной миграции, `VALIDATE CONSTRAINT` в **следующей** (в одной транзакции блокировка держится всё время проверки; Squawk это тоже ловит) |
| `SET NOT NULL` на заполненной колонке | миграция 1: `ADD CONSTRAINT c CHECK (col IS NOT NULL) NOT VALID`; миграция 2: `VALIDATE CONSTRAINT c`; миграция 3: `SET NOT NULL` (с PostgreSQL 12 мгновенно, проверка берётся из валидного CHECK) и `DROP CONSTRAINT c` |
| `ALTER COLUMN TYPE` (переписывает таблицу) | новая колонка, запись в обе, перенос данных (§3), переключить чтение, потом удалить старую (правила expand/contract уже в `check-migrations.mjs`) |
| `ADD COLUMN ... DEFAULT gen_random_uuid()/random()/nextval/SERIAL/IDENTITY` | колонка без default, default отдельно, заполнение порциями (§3). Константа и `now()` можно: PostgreSQL 11+ не переписывает таблицу |
| `ADD UNIQUE` / `PRIMARY KEY` на существующей | уникальный индекс `CONCURRENTLY`, потом `ADD CONSTRAINT ... UNIQUE USING INDEX` |
| Нет `SET LOCAL lock_timeout` | первой строкой: `SET LOCAL lock_timeout = '5s';` Запрос не встанет в очередь за долгим запросом и не заблокирует всех за собой (то же советует strong_migrations) |

**Исключение** (крошечная или только что созданная таблица): над оператором строка `-- squawk-ignore <правило>`, а причина отдельной строкой-комментарием выше. Примеры в `scripts/online-ddl.test.mjs`. Таблица, созданная в этом же файле, не проверяется.

Что даёт Prisma: `prisma migrate dev` пишет `CREATE INDEX` без `CONCURRENTLY`. Для индексов в `schema.prisma` на больших таблицах: сгенерируйте миграцию, **удалите** оттуда `CREATE INDEX`, положите его в `prisma/concurrent/` (в схеме индекс остаётся, дрейфа нет: после запуска раннера индекс на месте).

## 2. Индексы без блокировок: `prisma/concurrent/`

Проблема: `CREATE INDEX CONCURRENTLY` нельзя внутри транзакции, а Prisma оборачивает файл из нескольких операторов в транзакцию. Один оператор в файле работает, но при сбое остаются INVALID индекс **и** упавшая миграция, которая блокирует все следующие выкладки (P3009). Решение того же вида, что `disable_ddl_transaction!` у GitLab и Rails: такие индексы живут вне транзакционных миграций.

- Файл `apps/api/prisma/concurrent/20261101120000_messages_case_created_idx.sql`:
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_case_created_idx ON messages (case_id, created_at DESC);`
  Разрешены только `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS <имя>`, `DROP INDEX CONCURRENTLY IF EXISTS`, `REINDEX ... CONCURRENTLY` (проверяет CI).
- Запускает `node prisma/run-concurrent.mjs` **после** `prisma migrate deploy`: ECS-задача `migrate` теперь выполняет `npx prisma migrate deploy && node prisma/run-concurrent.mjs` (`scripts/deploy/run-migrations.sh` подставляет команду при каждой выкладке, `infra/modules/ecs/main.tf` совпадает). В CI раннер гоняется два раза подряд на мигрированной базе (второй раз ничего не делает).
- Учёт в таблице `concurrent_migrations` (имя, контрольная сумма). Исправлять применённый файл нельзя (раннер предупредит), добавьте новый.
- Одно соединение, `lock_timeout = 5s`; занятая таблица: до 5 повторов с паузой (как `with_lock_retries` у GitLab).
- Недостроенный индекс (обрыв, деплой убит): раннер находит INVALID индекс с этим именем, если его никто не строит сейчас, удаляет `DROP INDEX CONCURRENTLY` и строит заново. После сборки проверяет `indisvalid`.
- Если раннер упал, миграции схемы уже применены, новый код выкатывается без индекса; шаг `migrate` красный, повтор безопасен.

Проверено на локальном Postgres 16: первый запуск строит индекс, второй ничего не делает, искусственно испорченный INVALID индекс заменяется, при блокировке `ACCESS EXCLUSIVE` на 8 секунд раннер ждёт и достраивает.

## 3. Порционные переносы данных (backfill)

Код: `apps/api/src/common/backfill/` (ядро, охранник, хранилище), `apps/api/src/cli/backfill-runner.ts`, реестр `backfill.registry.ts`. Состояние в таблице `backfill_runs`.

Как пользоваться:
1. Миграция «расширить» (новая колонка NULL, без default).
2. Добавить в `BACKFILLS` запись с `apply`: идемпотентный `UPDATE ... WHERE <ключ в диапазоне> AND new_col IS NULL` (один порцион короче секунды; повтор порции ничего не меняет). Пример в комментарии реестра.
3. После выкладки одноразовой задачей: `scripts/deploy/prod-run.sh node dist/src/cli/backfill-runner.js <имя>`. Остановили/упало/перезапустили — продолжит с сохранённого места (`--restart` начать заново). `list`, `pause|resume|abort <имя>` есть и в консоли.
4. Когда готово: миграция «сжать» (NOT NULL по схеме из §1), запись из реестра удалить.

Как работает: ключи берутся диапазонами `(курсор, ключ_через_N]` по индексу первичного ключа (без OFFSET), порция по умолчанию 1000 строк, лимит 2000 строк/с (пауза после каждой порции). Курсор сохраняется после порции. Перед каждой порцией охранник смотрит и **отдыхает 5 секунд**, если: задержка реплики > 10 с (`pg_stat_replication.replay_lag`; без реплики сигнала нет), загрузка процессора БД > 75 % (свежее чтение `ops:capacity`), соединений > 80 % от `max_connections`, на этой таблице идёт автовакуум, владелец поставил паузу тяжёлых задач. Сломавшийся датчик работу не останавливает. Те же сигналы (автовакуум, WAL, здоровье БД) использует GitLab.

Админка: «Система → Масштаб → Переносы данных в фоне»: прогресс, причина ожидания, кнопки «Пауза», «Продолжить», «Остановить». Нужен свежий код 2FA (step-up), второй админ **не** нужен; действия пишутся в журнал (`ops.backfill_pause/resume/abort`). Процесс, не подававший признаков 2 минуты, показан красным «Не отвечает». Кнопки только меняют состояние, запускает команду человек.

## 4. Раздутие таблиц (bloat)

Ночью в 03:35 UTC задача `db.bloat-check` (в `jobs.constants.ts`) меряет горячие таблицы `messages, notifications, posts, sessions, search_outbox, cross_family_outbox`:
- таблицы больше 64 МБ: `pgstattuple_approx` (мёртвые строки + свободное место, без полного чтения) и `pgstatindex` для btree-индексов до 512 МБ (плотность листьев, свежий индекс ≈ 90 %);
- без расширения: доля мёртвых строк из `pg_stat_user_tables` (грубее).
Итог в Redis `ops:db-bloat` (3 суток). Если у большой таблицы мусора или у индекса «пустоты» больше 30 %, лампочка **«База»** в «Здоровье системы» жёлтая, в подробностях `bloatOver`. Само ничего не сжимается. Что делать: [docs/runbooks/pg-repack.md](../runbooks/pg-repack.md). Расширение `pgstattuple` один раз включает владелец (`CREATE EXTENSION pgstattuple;` под `rds_superuser`); в миграцию не положено, чтобы деплой не зависел от прав.

## 5. Что дальше (не включено)

- Цель по сжатию сильно раздутых таблиц без ручной работы: AWS не даёт автоматический repack, поэтому только по runbook.
- Подробная проверка вручную: `psql -f` с `SELECT * FROM pgstattuple_approx('messages')`.
