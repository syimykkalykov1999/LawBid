# Репетиция выкладки на копии прода (2026-10-27)

Сделано с Mac владельца, `aws login` (аккаунт 047754151252, пользователь sima-admin), us-east-1.
Код репетиции: `origin/main` @ `3e46ddbb1` (уже включает #477 deploy-safety и #480 tf-catchup).
Прод-базу не трогали: читали только снимок, восстановленный во временную копию. Копия удалена (подтверждено). Секретов в этом файле нет.

---

## Коротко для владельца (простыми словами)

**Миграции базы: можно выкладывать.** Я взял ночную копию прода (снимок 27.10 03:21 UTC), поднял из неё временную базу и прогнал на ней ровно ту цепочку, что пойдёт в выкладке (`migrate deploy` → `run-concurrent` → проверка схемы) с текущим кодом main. Вся цепочка заняла **22 секунды**. Самая тяжёлая миграция (`shard_id_backfill`, трогает 105 таблиц) отработала за **0,32 с**, потому что в проде мало данных: вся база 93 МБ, 240 таблиц, ~408 тысяч строк, из них 399 тысяч — переводы интерфейса. Сообщений 95, звонков 86. Блокировки таблиц на таких объёмах не страшны. Ошибок нет, «тихих пропусков» нет, битых индексов нет, права на sequences у приложения есть.

**Terraform (настройки сервера): СТОП, пока не применять.** План посчитан (ничего не менял). Он хочет добавить 200, изменить 52, заменить 4 и удалить 1 ресурс. Скрипт сам сказал красное «СТОП», потому что в плане есть удаление/пересоздание: 2 группы логов базы (теряются старые логи базы за 30 дней), 2 функции GuardDuty (на секунды выключаются) и одна старая тревога по процессору базы. Базу, серверы ECS, Redis, ключи, секреты план НЕ удаляет. Это мелочи, но скрипт такой план не примет, значит нужна маленькая правка кода (я могу сделать). Кроме того, план шире, чем «три вещи» из инструкции: это ещё 77 новых тревог, 45 счётчиков из логов, правка прав ключа KMS и правка заголовков безопасности/кэша CloudFront. Это надо прочесть, а не «нажать и забыть».

**Что нашёл по дороге (важно):**
1. **Миграции на проде идут под пользователем `lawbid_admin`, а не `lawbid_migrator`**, как написано в документах. Проверил по секрету `MIGRATOR_DATABASE_URL` (смотрел только имя пользователя, пароль не открывал). Все 240 таблиц принадлежат `lawbid_admin`. Из-за этого миграция `migrator_role_timeouts` на прод фактически не действует (её таймауты прилипают к роли, которой не пользуются), а если кто-то «исправит» секрет на `lawbid_migrator`, первая же миграция упадёт с «must be owner of table». На копии я это воспроизвёл.
2. **Пометки `last_good_tag` в AWS нет вообще** (`/lawbid-prod/deploy/last_good_tag` и `previous_good_tag` не существуют). Значит откат «по умолчанию» ни на что не укажет: нужно указывать версию руками. Сейчас на проде: api и admin — `15ac50c9…` (24.10), worker — `8248bb3ee…` (разные версии!).
3. **Кнопка `tf-catchup.sh plan` на этом Mac падала молча** (см. технический раздел, п. T3): кеш плагинов Terraform с символической ссылкой и короткоживущие ключи `aws login`. Я обошёл это у себя, в репозиторий ничего не правил. Лучше починить до того, как вы будете нажимать сами.
4. Прод сейчас здоров: за 24 часа в логах api **0 ошибок 5xx**, «permission denied for sequence» 0, «key store unavailable» 0, упавших фоновых задач 0, настоящих тревог нет.

**Моё решение: миграции GO. Выкладка кода в целом NO-GO, пока (а) не решён Terraform-план (п. «Шаги владельца») и (б) не поставлена пометка `last_good_tag`.**

---

## Пять ключевых чисел

| # | Что | Значение |
|---|---|---|
| 1 | Репетиция, вся цепочка миграций (165 миграций в коде, 49 применено к копии) | **22,0 с** (migrate 7,9 + concurrent 0,8 + verify-schema 13,3) |
| 2 | Самая тяжёлая миграция | **`20261024140100_shard_id_backfill` 0,32 с**; блокирует 105 таблиц с shard_id, в них всего **1 802 строки** (макс. `contact_book_hashes` 1 360). `shard_id_not_null` 0,07 с; `hot_path_indexes` 0,16 с (25 таблиц, макс. `messages` 95 строк) |
| 3 | Terraform plan | **СТОП**: +200 / ~52 / замена 4 / удаление 1 (удаляются только 2 группы логов RDS, 2 фичи GuardDuty, 1 тревога) |
| 4 | 5xx за 24 ч (api) | **0** (658 запросов, 18 из них 4xx) |
| 5 | Тревоги в ALARM | **0 настоящих**; 4 автоскейлинговые `AlarmLow` (штатное «мало нагрузки»); 2 в INSUFFICIENT_DATA (`lawbid-prod-redis-cpu`, `redis-memory`) |

---

## Шаги владельца (что нажимать дальше)

1. **Ничего не применять в Terraform сейчас.** Скажите Claude «правь план до зелёного». Он: (а) зафиксирует `log_group_class = STANDARD` для двух групп логов RDS, чтобы они не пересоздавались; (б) уберёт расхождение у двух фич GuardDuty (`RDS_LOGIN_EVENTS`, `RUNTIME_MONITORING`) через `ignore_changes`/точный конфиг; (в) старую тревогу `db_cpu` разрешит удалять в `plan-guard.sh` (тревоги безвредны); (г) починит `tf-catchup.sh` (п. T3). Потом заново `bash scripts/dev/tf-catchup.sh plan`, и только при зелёном «Опасных удалений и замен нет» — `apply` и ваше «ДА».
2. Перед apply прочесть в плане то, что не про тревоги: правка прав **ключей KMS** (2 шт.), **CloudFront** (кэш-поведение сайта, заголовки безопасности app/site, 2 функции, HTTP-версия медиа), права ролей ECS (2). Скажу, если что-то выглядит опасно.
3. Поставить пометку отката (я могу, скажите «да»): `aws ssm put-parameter --name /lawbid-prod/deploy/last_good_tag --type String --value <тег>`. Рекомендую `15ac50c960809644ba328fad828b135a74e51dc1` (так работают api и admin; worker надо привести к той же версии).
4. Решить про 14 настроек, которые новый код включает сам (таблица ниже). Рекомендую оставить как есть, кроме пометок.
5. Включить защиту main (команда из аудита, п. 1 «Шагов владельца»), если ещё не сделано.
6. Тихое окно для Approve: миграции займут ~20-30 с, но 30 минут — потолок в `run-migrations.sh`; мониторить задачу `lawbid-prod-migrate`.

### 14 настроек, которые новый код включает сам

| Настройка | Что значит по-простому | Рекомендация |
|---|---|---|
| `security.attorney_strong_auth` | Усиленная проверка входа для адвокатов (доп. шаг) | ВКЛ, но сначала проверить на тестовом адвокате |
| `privacy.login_cancels_deletion` (= false) | Простой вход в аккаунт больше НЕ отменяет запрошенное удаление | оставить (false) |
| `privacy.auto_retention` | Автоудаление данных по срокам хранения | ВКЛ |
| `security.password_breach_check_enabled` | Не пускать пароли из известных утечек | ВКЛ |
| `security.seal_case_metadata` | «Запечатывать» подробности дел (метаданные скрыты) | ВКЛ |
| `security.signup_block_disposable_email` | Запрет регистрации с одноразовой почты | ВКЛ |
| `moderation.csam.ncmec_submit_enabled` | Автоотправка жалоб о недопустимых материалах с детьми в NCMEC (требование закона США) | ВКЛ, но убедиться, что учётные данные NCMEC заведены |
| `moderation.strikes.enabled` | Система «страйков»: предупреждения, потом блокировка | ВКЛ |
| `moderation.report_abuse.enabled` | Защита от злоупотребления жалобами (ложные жалобы) | ВКЛ |
| `stickers.scan_uploads` | Антивирус для загружаемых стикеров (ClamAV есть) | ВКЛ |
| `push.chat_preview` | Текст сообщения виден в пуш-уведомлении на экране блокировки | Ваше решение; для юридической тайны я бы поставил ВЫКЛ |
| `legal.disclaimer.enabled` | Показ оговорки «это не юридическая консультация» | ВКЛ |
| `calendar.feed_enabled` | Ссылка-подписка на календарь консультаций/сроков | ВКЛ |
| `consultations.no_show_enabled` | Учёт неявки на консультацию | ВКЛ |

---

# Технический раздел

## 1. Факты о проде на момент репетиции (21:09 UTC)

| Что | Значение |
|---|---|
| SSM `last_good_tag` | **не существует**: ни `/lawbid-prod/deploy/last_good_tag` (имя из `deploy.yml`), ни `previous_good_tag`, ни `/lawbid/prod/last_good_tag`; в SSM вообще нет параметров |
| ECS api | task def `lawbid-prod-api:17`, образ `lawbid-api:15ac50c960809644ba328fad828b135a74e51dc1`, 1/1, 512 CPU / 1024 MB |
| ECS worker | `lawbid-prod-worker:15`, образ `lawbid-api:8248bb3ee36d7aae732cf7dea989de276c608fb5` + `lawbid-clamav:1.4`, 1/1, 512 / 4096 |
| ECS admin | `lawbid-prod-admin:17`, образ `lawbid-admin:15ac50c960809644ba328fad828b135a74e51dc1`, 1/1; `rolloutState = FAILED` (circuit breaker, события 24.10 17:13-17:18, «failed container health checks»); с тех пор 1 задача работает, статус не обновлён |
| migrate task def | `lawbid-prod-migrate:21`, образ `15ac50c9…`, секрет `MIGRATOR_DATABASE_URL` (пользователь в секрете: `lawbid_admin`), `readonlyRootFilesystem=true`, `/tmp` — том, но не доступен на запись пользователю `app` (см. 2.2) |
| ECR `lawbid-api` | последний пуш 24.10 18:43 (`47ece44b…`); образов с кодом текущего main нет |
| RDS | `lawbid-prod-postgres`, db.t4g.micro, PostgreSQL 16.13, 50 ГБ gp3, **Multi-AZ = True**, зашифрована, не публичная, бэкапы 14 дней, LatestRestorableTime 21:02 UTC |
| Снимки | `rds:lawbid-prod-postgres-2026-10-27-03-21` (03:21:49 UTC, available), 26.10 03:21, 25.10 03:22 |
| База (по копии) | 93 МБ, 240 таблиц, 408 370 строк, 116 применённых миграций, последняя `20261024120000_call_media_provider` |

Топ таблиц по строкам: `i18n_translations` 398 820; `i18n_keys` 4 692; `contact_book_hashes` 1 360; `search_synonym_terms` 692; `practice_areas` 386; `countries` 243; `auth_events` 226; `sessions` 193; `audit_log` 108; `messages` 95; `calls` 86; `notifications` 82.

## 2. Репетиция на копии

### 2.1 Копия
- `aws rds restore-db-instance-from-db-snapshot` из `rds:lawbid-prod-postgres-2026-10-27-03-21` → `lawbid-rehearsal-20261027`, db.t4g.micro (как у прода и как в `restore-drill.sh`), PG 16.13, single-AZ, `--no-publicly-accessible`, те же subnet group / parameter group / SG, тег `Purpose=restore-rehearsal`. Скрипт `restore-drill.sh` сам не годится (он удаляет копию сразу после smoke-запроса и не умеет прогон миграций), поэтому взяты его же параметры.
- 21:12:08 запрос → 21:18:56 `available` (6 мин 48 с) → смена мастер-пароля, 21:20:22 готово. Удалена 21:36:51, подтверждено `DBInstanceNotFound` в 21:38:22. Жила ~26 минут (≈ $0.02). Ручных снимков не осталось.
- Пароли копии: случайные, лежали только в файлах scratchpad (удалены) и в переопределении одноразовых ECS-задач; в чат и репозиторий не попали.

### 2.2 Сетевой путь
Копия приватная, с Mac недоступна. Использован тот же путь, что и у drill-скрипта: одноразовые задачи ECS из `lawbid-prod-migrate` (сети/SG сервиса api). Образ в ECR содержит старые миграции, поэтому в задачу передан маленький скрипт (gzip+base64, 4 КБ, переменная окружения), который:
1. проверяет, что хост начинается с `lawbid-rehearsal` и не совпадает с прод-хостом (иначе `REFUSED`), и подставляет `DATABASE_URL` копии явным образом, а не через секрет задачи;
2. качает из публичного репозитория `apps/api/prisma/{migrations,concurrent,schema.prisma,run-concurrent.mjs,verify-schema.mjs}` ровно коммита `3e46ddbb1` (170 файлов, 165 миграций);
3. запускает цепочку из `run-migrations.sh`: `npx prisma migrate deploy` → `node prisma/run-concurrent.mjs` → `node prisma/verify-schema.mjs` (`SCHEMA_DRIFT_CHECK=fail`), с засечкой времени каждой стадии;
4. читает из `_prisma_migrations` (`started_at`/`finished_at`) время каждой миграции.
Нюанс среды: `/tmp` в migrate-задаче не пишется пользователем `app` (первая попытка: «can't create /tmp/r.mjs: Permission denied»), использован `/dev/shm`. Вывод — через журнал `/lawbid/lawbid-prod/migrate`.

### 2.3 Результат цепочки (пользователь `lawbid_admin`, как на проде)
| Стадия | Время | Итог |
|---|---|---|
| `prisma migrate deploy` | 7,9 с | 49 миграций применено (116 → 165), «All migrations have been successfully applied» |
| `run-concurrent.mjs` | 0,8 с | «0 applied, 0 already done» |
| `verify-schema.mjs` | 13,3 с | «database matches schema.prisma (296 models)» |
| **Итого** | **22,0 с** | exit 0 |

Целевая проверка после: незавершённых/откатанных строк `_prisma_migrations` нет; невалидных индексов 0; из 6 sequences у `lawbid_app` USAGE есть на всех (находка 1 аудита закрыта миграцией `20261107134000_app_sequence_grants`).

Миграции по времени (топ-10, сек): `shard_id_backfill` 0,32; `shard_map_and_triggers` 0,17; `hot_path_indexes` 0,16; `staff_package` 0,16; `experiments_ranking_events` 0,12; `shard_id_add_column` 0,07; `shard_id_not_null` 0,07; `report_abuse_strikes` 0,05; `calendar_noshow` 0,05; `partition_messages_notifications` 0,05. Остальные ≤ 0,04.

Три тяжёлые из аудита (находка 3):
| Миграция | Время | Таблицы под блокировкой | Строк |
|---|---|---|---|
| `20261024140100_shard_id_backfill` | 0,32 с | 105 таблиц с колонкой `shard_id` | 1 802 всего; топ: contact_book_hashes 1 360, messages 95, calls 86, notifications 82, call_log_hidden 44 |
| `20261024140200_shard_id_not_null` | 0,07 с | те же 105 | то же |
| `20261029100000_hot_path_indexes` | 0,16 с | 25 таблиц | топ: messages 95, post_view_events 29, call_participants 18, posts 9 |

Оговорки к «0,32 с»: копия простаивала (нет конкурирующих сессий), одна зона (на проде Multi-AZ: синхронная запись на второй узел замедлит запись примерно в 1,5-2 раза, это всё равно секунды). Главный риск блокировок на живых данных остаётся для будущих больших выкладок, при текущих объёмах его нет. Если до Approve в базу зальют много данных (> сотни тысяч сообщений/уведомлений), прогон стоит повторить: он занимает ~15 минут и ~$0.02.

### 2.4 Находка: пользователь миграций
Первый прогон под `lawbid_migrator` (по документации) упал на первой же миграции: `P3018 ... ERROR: must be owner of table attorney_tasks` (SQLSTATE 42501). Причина: все 240 таблиц принадлежат `lawbid_admin`, `lawbid_migrator` не входит ни в какую роль-владельца. Секрет `lawbid-prod/MIGRATOR_DATABASE_URL` содержит пользователя `lawbid_admin` (проверено, пароль не выводился), `lawbid-prod/DATABASE_URL` — `lawbid_app`. Следствия: `docs/runbooks/DEPLOY_PROD.md`/`db-ops.md` неточны; `20261101310000_migrator_role_timeouts` для прода бесполезна (lock_timeout 5 с и statement_timeout 10 мин не действуют на `lawbid_admin`, а ретрай по 55P03 в `run-migrations.sh` не сработает, миграция будет ждать блокировку до 30-минутного потолка). Роль `lawbid_migrator` на копии: без `rolconfig` (таймауты ещё не выставлены, как и ожидалось до миграции). Строку с неудачной миграцией я удалил на копии и повторил под `lawbid_admin`.

### 2.5 API smoke на копии
Не делался. Причина: в ECR нет образа текущего main, а собирать и пушить образ в прод-ECR вне задачи нельзя; `npm run smoke:local` (из #477) работает на локальной свежей базе и проверяет ту же цепочку на пустой базе. Прогон API на копии лучше сделать уже в самой выкладке (canary + `smoke.sh` ×12).

## 3. Terraform plan (`scripts/dev/tf-catchup.sh plan`, apply НЕ запускался)

Результат: `result=STOP`, exit 1. Сводка скрипта (по-русски, без значений):
- Будет добавлено: **200**; изменено: **52**; заменено (-/+): **4**; удалено: **1**; новых версий описаний задач ECS: 4 (api/worker/admin/migrate; `container_definitions`).
- Крупные группы: 77 новых тревог CloudWatch + 20 изменяемых, 45 новых счётчиков из логов, 10 новых и 6 изменяемых composite-alarm, 9 параметров SSM, 8+7 прав/ролей IAM, 5 Athena named query, 5 EventBridge Scheduler, 3 budget, 3 Lambda, 2 S3-бакета (+lifecycle), 3 сервиса ECS (обновление, перезапуск по очереди), 2 CloudFront-дистрибутива, 2 CloudFront-функции, 2 response headers policy, 2 ключа KMS (только `policy`), 2 IAM-политики (`policy`).
- Что блокирует (guard):
  - `module.stack.module.postgres[0].aws_cloudwatch_log_group.rds["postgresql"]` и `["upgrade"]` [delete+create]: `log_group_class` STANDARD → INFREQUENT_ACCESS (в-месте менять нельзя; старые логи RDS за 30 дней пропадут);
  - `module.stack.module.security_baseline[0].aws_guardduty_detector_feature.rds_login` и `.runtime` [delete+create]: дрейф `additional_configuration` (в AWS у `RDS_LOGIN_EVENTS` включён `RDS_DATA_RISK`, в коде пусто; `runtime` — имена доп. настроек);
  - `module.stack.module.growth.aws_cloudwatch_metric_alarm.db_cpu[0]` [delete]: старая тревога `lawbid-prod-db-cpu` (CPUUtilization > 70 % 15 мин).
- Не затронуты: `aws_db_instance`, `aws_elasticache_*`, `aws_ecs_service` (только update), секреты, S3-данные.
- Что обновляется на проде «видимо»: `aws_cloudfront_distribution.web` (`ordered_cache_behavior`), `.media` (`http_version`), функции `app_noindex`/`seo_index` (`code`), политики заголовков `web["app"]`/`web["site"]` (`security_headers_config`), политики KMS (`kms.this`, `kms_replica.this`), `aws_iam_role_policy.task` и `execution_secrets`, у сервисов ECS `alarms` (circuit breaker) + новая task definition.
- Файлы плана с секретами (`~/.lawbid-tf-catchup/*`) удалены после чтения.

### Проблемы самого скрипта (T3), обнаружены при запуске
- **T3a. Молчаливый выход при ошибке `init`.** Кеш плагинов `~/.terraform.d/plugin-cache/.../darwin_arm64` на этом Mac — симлинк на `plugin-mirror-real`, `terraform init` падает «cannot install package into target directory because it is a symlink». В скрипте `terraform init … || { grep -E '^(Error|│ Error)' … | head; die … }`: из-за `set -e` + `pipefail` и цветных кодов `grep` ничего не находит, блок обрывается до `die`, пользователь видит только «Подготовка Terraform (init)...» и exit 1. Лечить: `grep -v` без `-e`-эффекта (`|| true`), `-no-color` для init, подсказка про кеш.
- **T3b. `ExpiredToken`.** Скрипт замораживает ключи из `aws configure export-credentials` (у `aws login` TTL ~15 мин, отданный набор может быть почти просрочен); план 2-10 мин → «STS 403 ExpiredToken». Лечить: `credential_process = aws configure export-credentials --format process` во временном `AWS_CONFIG_FILE`, чтобы провайдер обновлял ключи сам.
- Мой обход (ничего в репозитории не менял): пустой `TF_CLI_CONFIG_FILE` (без plugin cache, провайдеры скачались заново), временный `AWS_CONFIG_FILE` с `credential_process`, обёртка `aws`, скрывающая `configure export-credentials`.

## 4. Логи за 24 ч (Logs Insights, окно 20:xx-21:xx UTC 26-27.10)

Группы: `/lawbid/lawbid-prod/{api,worker,admin,clamav,migrate}`. Трафик очень мал: api 2 189 событий за сутки, из них 658 «request completed» (в основном `/health/live`, `/health/ready`).

| Запрос | api | worker | admin |
|---|---|---|---|
| 5xx по маршрутам (топ-10) | **пусто, 0** (из 658 запросов: 18 × 4xx; `Cannot GET /` 59, `/api/v1` 9, `/public/seo-settings` 3, 3 × истёкший токен, 3 × Stripe-вебхук с неверной подписью) | нет HTTP-логов | нет логов |
| «permission denied for sequence» | 0 | 0 | 0 |
| «key store unavailable» | 0 | 0 | 0 |
| level ≥ 50 (error/fatal) | 0 | 0 | — |
| Сбои cron-задач | нет | `queue depth` по всем очередям (`cron`, `push`, `files`, `subscriptions`, `stripe-webhooks`, `stripe-webhooks-dlq`, `data-export`, `case-history-export`): max failed = 0; max waiting на `cron` = 6 | — |

Замечание: «permission denied for sequence» на проде сейчас не воспроизводится, потому что на проде код `15ac50c9` (24.10), а проблемный `search_clicks` приходит с новым кодом; на копии после миграции права на sequences есть (0 из 6 без USAGE).

Тревоги (`describe-alarms`, всего 64 в аккаунте):
- `ALARM`: 4 штуки, все `TargetTracking-service/lawbid-prod/{api,worker}-AlarmLow-*` (штатные тревоги автоскейлинга «нагрузка ниже порога»; в ALARM с 13.10, 16.10, 24.10, 27.10): действий не требуют.
- `INSUFFICIENT_DATA`: `lawbid-prod-redis-cpu`, `lawbid-prod-redis-memory` (нет данных метрики; проверить размерности перед запуском).
- Остальные 58 — OK.

## 5. Go / No-go

| Часть | Решение | Основание |
|---|---|---|
| Миграции (49 штук) | **GO** | 22 с на копии прода, макс. 0,32 с, ошибок и дрейфа нет; потолок выкладки 30 мин с огромным запасом |
| Terraform apply | **NO-GO до правки** | План с красным СТОП (2 лог-группы, 2 GuardDuty, 1 тревога) + сам скрипт ломается молча (T3a/T3b) + изменения KMS/CloudFront надо прочесть |
| Выкладка кода (Deploy → Approve) | **NO-GO до п. 1-3 «Шагов владельца»** | нужны: зелёный план и apply (иначе у воркера нет прав SEO и тревог `cron-job-failing`/`migrate-failed`), пометка `last_good_tag` (иначе откат вслепую), решение по 14 настройкам. Версии api/admin (`15ac50c9`) и worker (`8248bb3ee`) на проде сейчас разные; это надо иметь в виду при откате |

Если Terraform будет приведён в порядок и `last_good_tag` поставлен, по результатам репетиции других блокеров для выкладки нет.

## 6. Что осталось (не делал, вне задачи)
- Правки `tf-catchup.sh`/`plan-guard.sh`/кода Terraform (п. 1 «Шагов владельца»).
- Исправление документации про `lawbid_migrator` vs `lawbid_admin` либо смена секрета (смена ломает миграции, пока владелец таблиц `lawbid_admin`; безопасный путь: оставить `lawbid_admin`, поправить документы и `migrator_role_timeouts`).
- Запись `last_good_tag` в SSM.
- Проверка `lawbid-prod-redis-cpu/-memory` (INSUFFICIENT_DATA).
