# Аудит: конфликты и безопасность выкладки (2026-10-27)

Приказ владельца 15:00: «залезь в main и в наши коды, сделай аудит, исправь где
надо, чтобы конфликтов отныне не было — ни в GitHub, ни в кодах, ни на сервере
при деплое». База: ветка `claude/staff-union-2026-10-27` (c8ac1f56e). На проде
сейчас версия **8248bb3ee от 24.10** (последний успешный Deploy), с тех пор в
`main` и union — 1323 коммита, **50 новых миграций**, 94 изменённых файла Terraform.

---

## Коротко для владельца

**Главное.** Ваше чувство верное: между «зелёным в GitHub» и «работает на
сервере» были дыры. Самые опасные я закрыл в коде (PR ниже), остальное — ваши
кнопки в конце документа.

Что нашёл и что сделал:

1. **На проде уже сейчас не работает часть поиска** (журнал запросов, «клик по
   результату» отвечает ошибкой). Причина: у пользователя базы, под которым
   работает сервер, нет права на «счётчики» таблиц; в CI база работает под
   главным пользователем, поэтому CI этого не видит. → **Исправлено** (миграция
   с правами + тест, который это ловит).
2. **Одна из новых миграций может «тихо пропустить» свою работу** на живой
   базе (если таблица занята) — и тогда реакции/правки/сохранённые сообщения в
   чатах падают после выкладки. → **Исправлено**: после миграций выкладка теперь
   сверяет базу со схемой и **останавливается до** запуска новой версии.
3. **Настройки сервера проверялись только когда новая версия уже запускалась**
   (после миграций) — отсюда «штормы» перезапусков. → **Исправлено**: перед
   миграциями новая версия проверяет настоящие ключи/настройки сервера, базу,
   Redis и KMS и, если что-то не так, пишет **имя** настройки и останавливает
   выкладку, ничего не меняя.
4. **Нет теста «код ↔ сервер»**: если в коде появляется обязательная настройка,
   а в Terraform её нет — узнавали на сервере. → **Исправлено**: тест сравнивает
   правила кода с описанием задачи сервера (Terraform). Он уже нашёл ловушку:
   если включить пуши FCM в Terraform без секрета `FCM_PRIVATE_KEY` — сервер не
   стартует.
5. Удаление фото из CDN после модерации **никогда бы не сработало** (отправляли
   500 масок за раз, AWS разрешает 15). → **Исправлено**.
6. Карточка «Очереди» в админке смотрела только одну из трёх очередей фоновых
   задач. → **Исправлено**.
7. Конфликты PR: в GitHub **нет защиты main**; самые «горячие» общие файлы
   перечислены ниже, для каждого — способ, как убрать конфликт. Часть уже делает
   ветка `claude/conflict-proof-registries`, здесь добавлены правила слияния и
   то, что она не покрывает.

**Риск, который я не могу снять кодом:** 50 миграций одной выкладкой. Пока база
почти пустая (до запуска) — это секунды. Если в базе уже есть реальные данные
(сотни тысяч сообщений/уведомлений), три миграции держат блокировку таблиц
минутами. Перед Approve: я проверю число строк (нужен `aws login`), и если
таблицы большие — разобьём выкладку.

**Ваши кнопки** — раздел «Шаги владельца» в конце (защита main одной командой,
Terraform apply, права для SEO, пара решений «да/нет»).

---

## Топ-10 находок (P0 — ломает прод при следующей выкладке)

| # | Приоритет | Что | Где | Статус |
|---|---|---|---|---|
| 1 | **P0 (уже на проде)** | `lawbid_app` без USAGE на sequences: INSERT в таблицы с SERIAL/BIGSERIAL падает «permission denied for sequence». Сейчас: `search_query_log` (тихо), `search_clicks` (эндпоинт клика ждёт INSERT → 500). Дальше: `search_outbox` (каждая запись users/cases/posts при `search.engine` ≠ postgres!), `shard_change_log`, `admin_appeals.author_alias`. CI — суперпользователь, не видит | `apps/api/prisma/migrations/20261014100000_postgres_baseline/migration.sql:4523` (только TABLES); `src/modules/search/search-log.service.ts:62,86`; `search.controller.ts:231` | **Исправлено**: `20261107134000_app_sequence_grants` + `test/db-app-role-grants.e2e-spec.ts`. Проверено на PG16 локально |
| 2 | **P0 (условно)** | `20261107131300_partition_messages_notifications` при занятой/большой таблице возвращает `skipped: busy/big/index` с NOTICE, Prisma помечает миграцию применённой, а `schema.prisma` уже требует `conversation_id`/составные ключи → P2022 на реакциях/правках/скрытии/сохранённых | `.../20261107131300_partition_messages_notifications/migration.sql:79-103,189`; `schema.prisma` model MessageReaction | **Исправлено**: `apps/api/prisma/verify-schema.mjs` в migrate-задаче (`scripts/deploy/run-migrations.sh`) — та же проверка дрейфа, что в CI, но против настоящей базы; выкладка встаёт до запуска api |
| 3 | **P0 (если в базе есть данные)** | Блокировки в 50 миграциях: `20261024140100_shard_id_backfill` (UPDATE ~105 таблиц одной транзакцией), `20261024140200_shard_id_not_null` (CHECK+VALIDATE+SET NOT NULL в одной транзакции = ACCESS EXCLUSIVE на время скана), `20261029100000_hot_path_indexes` (~30 индексов без CONCURRENTLY). `20261101310000_migrator_role_timeouts` в этой выкладке не действует (ALTER ROLE — для новых сессий) | файлы миграций; `scripts/deploy/run-migrations.sh:19` (30 мин) | Не исправлено (миграции уже в main, править нельзя — контрольные суммы). Перед Approve — проверить число строк; при больших таблицах: прогнать бэкфилл заранее, выкатывать в тихое окно |
| 4 | P1 | Настройки сервера проверяются только при старте новых задач (после миграций) → откат ECS, «шторм» | `apps/api/src/config/configuration.ts:3-14` | **Исправлено**: `src/cli/check-config.ts` + режим `config` в `scripts/deploy/prod-admin-ecs.sh` + шаг «Config preflight» в `deploy.yml` перед миграциями (staging и prod) |
| 5 | P1 | Нет контракта env «код ↔ Terraform»; найдено: наборы «все или ни одного» `FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY` и `CLOUDFRONT_PRIVATE_DOMAIN/_KEY_ID/_KEY_PEM` — заполнили tfvars без `extra_secrets` → api не стартует | `env.schema.ts:1128-1149`; `infra/modules/stack/main.tf:786-798,1477-1580` | **Исправлено**: `src/config/config-contract.spec.ts`; `api-ci.yml` теперь запускается и на изменения `infra/modules/stack/main.tf`, `infra/modules/ecs/main.tf` |
| 6 | P1 | `cdn.invalidate` шлёт до 500 wildcard-путей одним запросом; CloudFront держит ≤15 wildcard «в работе» → отказ, пути крутятся по кругу, копии удалённых файлов живут в CDN до TTL | `src/modules/files/storage/cdn-invalidation.ts:107`; `app-settings.defaults.ts:1021` | **Исправлено**: потолок 15 на запрос (`MAX_WILDCARD_PATHS_PER_REQUEST`) + тест |
| 7 | P1 | Сторож «Очереди» смотрел только `cron`, а сигнальные задачи (метрики очередей, ops guard, сам сторож) переехали в `cron-fast`, тяжёлые — в `cron-heavy` | `src/common/ops/status/status-probes.service.ts:285` | **Исправлено**: все три линии, худшая определяет цвет, `lanes` в detail + тест |
| 8 | P1 | Нет тревоги CloudWatch на: одну постоянно падающую cron-задачу (privacy.retention, ledger.reconcile, seo.generate, staff.*) — `queue-failed-critical` не включает cron-линии, `queue-failed-many` требует ≥10/5 мин; на упавшую migrate-задачу — только issue в GitHub | `infra/modules/monitoring/main.tf:369-372` | Закрыто в Terraform PR #480 (`cron-job-failing`, `migrate-failed`) — нужен apply |
| 9 | P1 | Terraform сильно отстаёт от кода (94 файла, 15 новых модулей). Тревоги отката ECS (`alarms { rollback = true }`) при частичном apply могут откатывать хорошую версию воркера (метрика `HeapUsedMb` отсутствует → breaching) | `infra/modules/ecs/main.tf` (alarms), `infra/modules/monitoring/main.tf` | Шаг владельца: apply одним сохранённым планом, ДО выкладки кода |
| 10 | P1 | Новые значения enum (legal_doc_type, notification_type, case_journal_event, data_request_type) пишут новые задачи; старый Prisma-клиент (8248bb3ee) падает при чтении → список юр. документов в админке ломается на время выкладки и **навсегда после отката** | `20261028600000_*`, `20261107116310_*:40`, `20261107122000_*:3-6`; `LegalDocumentsSeed.onModuleInit` | Принято как риск (только админка); откат = сначала удалить черновики новых типов (команда ниже) |

Ещё P1/P2 — в приложении A.

---

## Часть 1. Почему PR конфликтуют и как это убрать

### Данные: какие файлы трогали больше всего PR (слияния в main с 24.10)

| Файл | PR | Как сделать бесконфликтным | Кто |
|---|---|---|---|
| `packages/api-contract/openapi.json` + `dart/lib/**` | 36 / 25 | Сгенерированные: при конфликте взять любую сторону и `npm run contract:fast`; pre-commit сам регенерирует | conflict-proof; здесь — `linguist-generated` в `.gitattributes` |
| `apps/api/src/common/app-settings/app-settings.defaults.ts` | **36** | Один огромный объект → **по файлу на модуль** (`<module>.settings.ts`, как уже сделано `staff-settings.ts`, который вливается в `APP_SETTINGS` на `:1686`), индекс собирает их сам | следующая волна, отдельной задачей (сейчас тронуло бы T4/T9/T10) |
| `apps/api/src/modules/admin-config/config-schema.ts` | 30 | То же: секции схемы по модулям, индекс | следующая волна |
| `apps/admin/src/app/(app)/config/page.tsx` | 34 | Страница рисуется из схемы (data-driven), без ручных блоков на каждый ключ | следующая волна |
| `infra/modules/stack/main.tf` | 32 | Разнести по файлам на фичу (`growth.tf`, `events_stream.tf` — образец уже есть); `api_env` собирать `merge()` из `locals` разных файлов | следующая волна |
| `apps/api/prisma/schema.prisma` | 20 | Multi-file schema Prisma (папка `prisma/schema/*.prisma`, GA с Prisma 6.6) — по файлу на модуль | следующая волна |
| `jobs.runner.spec.ts`, `cron.processor.ts`, `jobs.constants.ts`, `jobs.module.ts` | 17/16/15/13 | Числа в спеках выводятся из кода (conflict-proof). Остаётся `switch` в `cron.processor.ts` → реестр «имя → обработчик», который каждый модуль заполняет своим провайдером | conflict-proof (спеки); реестр — следующая волна |
| `module-boundaries.baseline.json` | 16 | Генератор `npm run arch:baseline` | conflict-proof |
| `docs/dev/SWITCH_INVENTORY.md`, `two-db-suites.json`, allowlists | 14 | Сортировка скриптом `lists:sort` | conflict-proof |
| `shard-manifest.ts/.spec.ts` | 11 | Счётчики выводятся из Prisma-моделей | conflict-proof |
| `ops/prelaunch-wipe.plan.ts`, `privacy/personal-data-registry.ts` | 11 | Одна строка на таблицу + сортировка (добавить в `sort-lists.mjs`) или вывод из `@@map` моделей | следующая волна |
| `apps/admin/src/lib/rbac.ts`, `nav-groups.ts` | 13 | Один элемент на строку, отсортировано; добавить в `lists:sort` | следующая волна |
| `common/errors/error-code.enum.ts` + `mobile/.../api_error.dart` | 8 / 9 | Dart-зеркало генерировать из enum (как `error_code.dart` в контракте), а не вести руками | следующая волна |
| `FLAG_CATALOG` (mobile) | — | Генерировать из `app-settings` (флаги с `client: true`) | следующая волна |
| `packages/api-contract/oasdiff-err-ignore.txt` | 9 | Список строк, порядок не важен → **`merge=union`** | **сделано** (`.gitattributes`) |
| `package-lock.json` | 15 | При конфликте: взять main и `npm install --package-lock-only` | правило |
| Имена миграций | — | Одна волна = один union = union раздаёт диапазон имён | правило есть |

Про `merge=union`: git сам склеивает строки обеих сторон. **GitHub-кнопка
слияния это правило игнорирует** (запрос висит с 2021: GitHub community
discussion #9288), поэтому оно помогает там, где мы сливаем локально — в union-
ветках. Для JSON/TS/YAML union опасен (может сломать синтаксис или оставить две
версии одной записи) — только для списков строк.

### Защита main (сейчас выключена: `gh api …/branches/main/protection` → 404)

Предложение (как вы хотите: только merge-коммит, «Require branches to be up to
date» ВЫКЛ, без второго человека):
- Require a pull request (0 одобрений), только **Merge commit**;
- Block force pushes и удаление main;
- Required status checks: только **`gitleaks`** — единственная проверка, которая
  идёт на КАЖДОМ PR. `API CI`, `Admin CI`, Mobile запускаются по путям: если их
  сделать обязательными, PR без изменений в этой части будет ждать вечно
  (ограничение GitHub). Их зелёный цвет и так требует наш поезд слияний и
  ворота Deploy «Wait for green CI».
- `infra-apply.yml` пишет в main напрямую, но при отказе сам открывает PR — с
  правилом он продолжит работать.

Команда — в «Шагах владельца» (п.1). Dependabot-автослияние в этом PR
переведено с `--squash` на `--merge`, иначе оно бы упёрлось в правило.

Позже (P2): одна «собирающая» проверка, которая идёт всегда и ждёт нужные по
путям workflow — тогда обязательными можно сделать все.

---

## Часть 2. Безопасность выкладки: что отличается между CI и сервером

### 2.1 Настройки и секреты (env contract)
- Задача api и worker получают одинаковые env + секреты
  (`infra/modules/ecs/main.tf:487-590`); админка — без секретов; migrate —
  только `MIGRATOR_DATABASE_URL`.
- Обязательные в prod (по `env.schema.ts`): `NODE_ENV=production, DATABASE_URL
  (sslmode), REDIS_URL (rediss://), JWT_KEYS, JWT_ACTIVE_KID, OTP_CODE_SECRET,
  OTP_KEY_PEPPER, AUTH_EVENT_PEPPER, MESSAGE_ENC_KEYS, MESSAGE_ENC_ACTIVE_KID,
  TRUST_PROXY_HOPS≥1`; Twilio/SES/Stripe — не обязательны, пока задан
  `SECRETS_MASTER_KEYS` (ключи в админке). Все есть в `api_env` +
  `secret_names` (`stack/main.tf:786-798, 1477-1580`). Пропущенных имён нет.
- Проверка силы ключей (`key-strength.ts`) в prod: слабый/короткий ключ →
  новая версия не стартует. Теперь это ловит preflight ДО миграций.
- `DB_REPLICA_HOST` никогда не попадает в задачу: `local.db_replica_env`
  (`stack/main.tf:1747`) не входит в `merge()` на `:1784` (P2, тумблер реплики
  мёртвый).
- SEO: `SEO_WEB_BUCKET`, `SEO_SITE_URL`, `SEO_WEB_DISTRIBUTION_ID` нигде в
  Terraform не заданы; job `seo.generate` без них ничего не делает (безопасно),
  но страницы не публикуются (шаг владельца).

### 2.2 «key store unavailable» / «Engine was empty» — опасно ли в проде?
- `key store unavailable` — `src/common/secrets/secrets.service.ts:318`:
  при ошибке чтения ключей из БД ставится пауза 60 с, логируется одна строка,
  используются ключи из env. **Не crash-loop**, не больше 1 строки/мин/процесс.
- `Response from the Engine was empty` — это Prisma (`@prisma/client/runtime`):
  движок запросов умер/отключён посреди запроса. В CI это следствие гибели
  процесса jest (OOM шарда 3, `--max-old-space-size` подняли в #461), а не
  баг SecretsService. В проде такое возможно только при OOM задачи — тогда
  ECS перезапускает задачу (healthcheck), тревога `api-unhealthy-hosts`.
- KMS: `unwrapKmsWrappedKeys()` (`main.ts:21`, `worker.ts:21`) падает при
  ошибке KMS → задача не стартует (правильно). Теперь проверяется в preflight.

### 2.3 Миграции (50 с последней выкладки) — N-1
- Нет DROP/RENAME/смены типа/NOT NULL без DEFAULT на таблицах, куда пишет
  старый код. Старый код живёт на новой схеме (триггеры заполняют `shard_id`,
  `conversation_id`).
- Блокировки — находка 3; права — находка 1; тихий пропуск — находка 2;
  enum — находка 10.
- Каждая многооператорная миграция — одна транзакция: `NOT VALID` +
  `VALIDATE` в одном файле не помогают (блокировка держится до COMMIT).
  Правило на будущее: `VALIDATE` — отдельной миграцией (как
  `20261107132100_staff_package_validate`).
- Полный список 50 с вердиктом — приложение B.

### 2.4 Фоновые задачи при выкладке
- 102 расписания (было 63 на проде): +39 новых, переименований/удалений нет;
  `ops.backup-check` теперь раз в сутки.
- Расписания ставит только worker при старте (`jobs.runner.ts:124`), api —
  `JOBS_ENABLED=false`. Тяжёлой работы при старте нет.
- **Окно смешанных версий** (P2, само проходит): старые worker'ы читают ту же
  очередь `cron` и бросают `Unknown cron job` на новые имена
  (`cron.processor.ts:528` в 8248bb3ee), а при своём перезапуске удаляют
  «чужие» расписания. Ожидаемо: пачка failed-задач и, возможно, письмо
  `queue-failed-many` во время выкладки воркера. После ухода старых задач всё
  нормально (reconcile каждые 30 с).
- Включённые по умолчанию новые задачи: privacy.retention, deletion-notices,
  stripe-ops.*, stripe-webhooks.requeue, legal.reminders, appeal-sla,
  access-report, ledger.reconcile, db.health, db.bloat-check,
  chat.search-backfill, case-tools.sweep, cdn.invalidate. Все staff.* и
  seo.generate — без работы при выключенных тумблерах.

### 2.5 Тумблеры по умолчанию
- Все 35 `staff.*_enabled` = false (`staff-settings.ts:15-50`), при отсутствии
  строки — OFF (`stored[k] === true`). `seo.generator_mode`='off', `seo.*` =
  false. Буст: новые модели оплаты OFF, `impressions` как сегодня.
- **Новые значения ON, которые меняют поведение относительно прода** (нужно
  «да/нет» владельца, `app-settings.defaults.ts`):
  `security.attorney_strong_auth` (:1402), `privacy.login_cancels_deletion=false`
  (:1551), `privacy.auto_retention` (:1543), `security.password_breach_check_enabled`
  (:852), `security.seal_case_metadata` (:1411), `security.signup_block_disposable_email`,
  `moderation.csam.ncmec_submit_enabled` (:1379), `moderation.strikes.enabled`,
  `moderation.report_abuse.enabled`, `stickers.scan_uploads`, `push.chat_preview`,
  `legal.disclaimer.enabled`, `calendar.feed_enabled`, `consultations.no_show_enabled`.

### 2.6 Соединения
- Пул Prisma = `DB_POOL_SIZE` = max(3, min(10, 0.8·max_conn / (2·(api_max+worker_max))))
  (`stack/main.tf:1443,1479`) → при 50/20 задачах = 3. Worker теперь крутит до
  5 maintenance-задач одновременно (`CRON_LANE_CONCURRENCY`, `jobs.constants.ts:33`)
  на пуле 3 → «Timed out fetching a new connection» (P1). Решение: отдельный
  `worker_db_pool_size` = 6 (PR #480, после apply) или PgBouncer (`db_pooler_enabled`).
- `check "db_connection_budget"` только предупреждает и не считает админку,
  migrate, retention-клиенты, реплику.
- Redis: +~4 соединения на worker (3 линии), staff ничего не добавил. Тревоги
  `redis-connections` есть.

### 2.7 Здоровье и порядок выкладки
- Порядок (`deploy.yml`): ворота «зелёный CI» → сборка → подпись → [prod]
  проверка подписи → бэкап (≤26 ч) → снимок при contract-миграции →
  **(новое) Config preflight** → migrate-задача (`migrate deploy` →
  `run-concurrent` → **(новое) verify-schema**) → переводы → (канарейка) → api
  → smoke (версия ×12) → worker+admin → smoke → синтетика → `last_good_tag`.
- ALB и ECS смотрят `/health/live` (без зависимостей); `/health/ready` — БД +
  Redis. Проверку «схема не отстаёт» в `/health/ready` не добавлял: роль
  `lawbid_app` намеренно не читает `_prisma_migrations` (baseline REVOKE).
  Вместо этого — verify-schema в migrate-задаче (раньше и надёжнее).

### 2.8 Откат
- `rollback.yml` → `last_good_tag` из SSM (или `previous_good_tag`). Если SSM
  пуст (выкладка 24.10 могла быть до этой записи) — передать
  `image_tag=8248bb3ee…` руками; образ должен быть в ECR (правило «хранить 60»).
- Миграции не откатываются — и не нужно (все расширяющие), КРОМЕ enum (находка
  10): перед откатом выполнить (через `scripts/deploy/prod-run.sh` / одноразовую
  задачу) `DELETE FROM legal_documents WHERE doc_type IN ('community_guidelines','advertising_disclosure','sms_terms') AND status='draft';`
  (черновики, которые сеет `legal-documents.seed.ts:90`; если владелец уже
  опубликовал документ такого типа — не откатывать, а чинить вперёд)
  — иначе старая админка не откроет список документов.
- После отката: новые расписания `cron-fast`/`cron-heavy` осиротеют (вреда нет).

### 2.9 CloudFront
- `scripts/seo/invalidate.mjs`: ≤10 масок, ≤30 путей; job `seo.generate` —
  только точные пути. `/*` нигде нет. Последняя дыра — `cdn.invalidate` —
  закрыта (находка 6).

### 2.10 Наблюдаемость без Sentry
- Ловится: 5xx API (`alb_5xx_ratio`), p95, нездоровые хосты, нет задач api/
  worker, падения критичных очередей, ≥10 падений в любой очереди за 5 мин,
  возраст очереди, пропавшие расписания; админка «Сбои за 24 ч»
  (`apps/admin/src/app/(app)/system-health/page.tsx:185`), пуши дежурным
  (`incidents.service.ts:225-239`).
- Не ловится (находка 8): одиночная постоянно падающая cron-задача; упавшая
  migrate-задача (только GitHub issue + SNS, если задан `AWS_NOTIFY_ROLE`).
- Большая часть этих тревог — ещё не применённый Terraform (находка 9).

---

## Часть 3. «Работает, а не только код»: smoke

### 3.1 Локально, перед Approve (делаю я)
`scripts/dev/heavy.sh npm run smoke:local` (новый `scripts/dev/smoke-local.sh`):
свежая база `lawbid_smoke` → ровно цепочка migrate-задачи прода
(`migrate deploy` → `run-concurrent` → `verify-schema`) → preflight
`check-config` → сборка и запуск api (`JOBS_ENABLED=false`, как ECS) [и worker
с `SMOKE_WORKER=1`] → `/health/live`, `/health/ready`, `/config/bootstrap` = 200
и **по одному GET на каждый модуль из openapi.json** (список выводится сам —
без ручного реестра): любой 5xx или «нет ответа» = красный; 401/403/404
(нужен вход / модуль за выключенным тумблером) = норма. Контейнеры, которые
поднял сам, останавливает; базу удаляет.

### 3.2 На сервере, после выкладки (владелец, из админки)
1. «Здоровье системы»: все карточки зелёные, «Очереди» — три линии без
   старых задач; «Сбои за 24 ч» — пусто.
2. Открыть приложение: лента, поиск (теперь журнал запросов работает), чат —
   поставить реакцию на сообщение (проверка находки 2).
3. Админка → Настройки → убедиться, что все `staff.*`, `seo.*`, новые модели
   буста выключены.
4. Через 30 минут: письма `ci-alert`/`queue-failed-many` — только про окно
   выкладки воркера (п. 2.4), новых нет.

---

## Шаги владельца (порядок важен)

1. **Защита main** (одна команда в Терминале Mac):
   ```sh
   gh api -X PATCH repos/syimykkalykov1999/LawBid -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false
   gh api -X POST repos/syimykkalykov1999/LawBid/rulesets --input - <<'JSON'
   {"name":"main","target":"branch","enforcement":"active",
    "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
    "rules":[
      {"type":"deletion"},
      {"type":"non_fast_forward"},
      {"type":"pull_request","parameters":{"required_approving_review_count":0,
        "dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,
        "require_last_push_approval":false,"required_review_thread_resolution":false,
        "allowed_merge_methods":["merge"]}},
      {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,
        "required_status_checks":[{"context":"gitleaks"}]}}
    ]}
   JSON
   ```
   Проверка: `gh api repos/syimykkalykov1999/LawBid/rulesets`.
2. **Перед выкладкой этого кода** — Terraform apply prod одним сохранённым
   планом (я готовлю план, вы жмёте Run; если в плане `-/+ replace` у
   `aws_ecs_service` — не применять). Модули: stack, monitoring, ecs, alb, s3,
   postgres, redis, network, web, security-baseline, backup, budget, kms,
   cdn-waf, growth, ses + новые (pgbouncer, redis-autoscale, db-autoscale,
   endpoints-autoscale, secret-rotation, signing-guard, status-page,
   opensearch-serverless, org-guardrails, aws-config, audit-logs,
   cloudtrail-athena, break-glass, macie, fis-gameday) — почти все выключены
   переменными; bootstrap (роли деплоя, `AWS_PLAN_ROLE`).
3. Уже в коде (PR #480, влит в main 2026-10-27) и войдёт в тот же план —
   отдельно делать ничего не нужно: права роли воркера на SEO-префиксы
   web-бакета + `cloudfront:CreateInvalidation/ListInvalidations` и env
   `SEO_WEB_BUCKET` / `SEO_WEB_DISTRIBUTION_ID` / `SEO_SITE_URL`; тревоги
   `cron-job-failing` (2 из 3 последних часов) и `migrate-failed` (EventBridge);
   `worker_db_pool_size` = 6. Кнопка: `scripts/dev/tf-catchup.sh plan|apply`
   (docs/runbooks/TF_CATCHUP.md).
4. `aws login` — чтобы я посмотрел число строк в больших таблицах перед
   Approve (находка 3) и `last_good_tag` в SSM.
5. Ответить «да/нет» по тумблерам, которые новый код включает сам (п. 2.5).
   Рекомендую оставить как есть, кроме `security.attorney_strong_auth` —
   проверить на тестовом адвокате до релиза.
6. Переменные GitHub (по желанию): `SCHEMA_DRIFT_CHECK` — по умолчанию `fail`
   (не трогать); `warn` — только если выкладка встала на сверке схемы и мы
   осознанно идём дальше.

---

## Приложение A. Остальные находки (технически)

- P1 `20261101310000_migrator_role_timeouts` (L12-13): `ALTER ROLE … SET` не
  действует на уже открытую сессию `migrate deploy` → эта выкладка без
  lock/statement timeout, кроме 30-мин дедлайна. На будущее — `SET LOCAL
  lock_timeout` в каждой миграции (squawk `require-lock-timeout` это требует
  только для новых).
- P1 CI ходит в базу суперпользователем → любые ошибки прав невидимы. Добавлен
  `test/db-app-role-grants.e2e-spec.ts`; следующий шаг (P2) — гонять часть e2e
  под `lawbid_app`.
- P2 `20261107131400_audit_chain_head` + advisory lock в `20261107125000:34`
  сериализуют все вставки audit_log (старые и новые задачи).
- P2 `prisma/concurrent/*.sql`: в CI проверка дрейфа идёт ДО
  `run-concurrent` (`api-ci.yml:175` vs `:218`) — при первом файле в
  `concurrent/` CI покажет ложный дрейф; в проде verify-schema идёт ПОСЛЕ
  (правильно, `docs/architecture/ONLINE_DDL.md:40`).
- P2 `env.schema.ts:1180`: сообщение об ошибке Stripe без имени переменной —
  **исправлено**.
- P2 `jobs.runner.ts:174`: пульс воркера пишется только когда живы все три
  линии — хорошо, но `queuesProbe` теперь тоже смотрит все три (находка 7).
- P2 `queue-failed-many` срабатывает в окно смешанных версий (2.4) — ожидаемо.
- P2 Канарейка (`CANARY_ENABLED`) выключена; для выкладки с 50 миграциями
  она не помогает (миграции идут до неё).
- P2 Ворота Deploy «Wait for green CI» ждут все проверки коммита — после
  добавления путей `infra/modules/{stack,ecs}/main.tf` в `api-ci.yml` PR только
  с Terraform тоже гоняет API CI (+40-70 мин, но ловит разрыв env).

## Приложение B. 50 миграций: вердикт

SAFE: 20261024100000_file_access_log, 20261024120000_call_media_provider,
20261025090000_cross_family_outbox, 20261025120000_license_expires_source,
20261026100000_optimistic_version (старые задачи не повышают `version`),
20261026110000_money_ledger (вебхуки старых воркеров без проводок → после
выкладки `ledger.reconcile`), 20261031200000_message_search_tokens,
20261101300000_autovacuum_hot_tables, 20261101310000_migrator_role_timeouts,
20261101320000_new_sharded_id_function, 20261101330000_cross_family_inbox_applied_at_index,
20261106120000_experiments_ranking_events, 20261107100000_push_tokens_actor_style,
20261107102000_search_outbox_coalesce, 20261107109000_drop_posts_popular_idx,
20261107116000_domain_events, 20261107116300_sessions_net_created_idx (concurrent),
20261107116320_data_residency_home_region, 20261107116500_partition_audit_auth,
20261107120000_infra_change_requests, 20261107123000_age_sms_email_compliance,
20261107126000_attorney_ad_archive, 20261107127000_shard_move_tool (+права — исправлено),
20261107129000_stripe_robustness, 20261107129100_stripe_webhook_unprocessed_idx,
20261107131000/131100/131200 *_key_index (concurrent; убитая сборка → INVALID
индекс → partition пропустит работу → теперь ловит verify-schema),
20261107131500_online_ddl_tables, 20261107132000_staff_package (админы, созданные
старыми задачами, получат workspace='mass'), 20261107132100_staff_package_validate,
20261107133000_boost_billing_models.

RISKY (блокировки): **20261024140100_shard_id_backfill (P0 при данных)**,
**20261024140200_shard_id_not_null (P0 при данных)**,
20261024150000_shard_map_and_triggers (P1, 104 CREATE TRIGGER без lock_timeout),
20261024160000_search_outbox (P1 + права — исправлено),
20261029100000_hot_path_indexes (P1, ~30 индексов без CONCURRENTLY),
20261029500000_sealed_metadata_limits (P1, VALIDATE в той же транзакции),
20261024140000_shard_id_add_column (P2), 20261031200100_legal_qa_fts_indexes (P2),
20261107116100_legal_qa_safety (P2), 20261107116200_report_abuse_strikes (P2),
20261107124000_calendar_noshow (P2), 20261107125000_admin_audit_hardening (P2),
20261107131400_audit_chain_head (P2).

RISKY (N-1 enum): 20261028600000_legal_doc_types_community_ads_sms (P1),
20261107116310_privacy_hardening (P1), 20261107122000_case_tools_lifecycle (P1),
20261107116400_legal_requests (P2, только админка).

**P0 (условно, тихий пропуск):** 20261107131300_partition_messages_notifications
— теперь выкладка останавливается (verify-schema).

## Источники
- CloudFront Developer Guide, «Quotas» → invalidations: «Maximum number of
  wildcard paths in progress: 15» (docs.aws.amazon.com, 2025-2026).
- PostgreSQL 16 docs, `nextval`: нужен USAGE или UPDATE на sequence; identity —
  без отдельного права. Проверено локально 2026-10-27.
- GitHub community discussion #9288 «Pull request conflicts: Support
  merge=union» (открыт; GitHub-слияние игнорирует `.gitattributes merge=`).
- Prisma docs «Multi-file Prisma schema» (GA с 6.6.0, 2025).
- GitHub REST «Repository rulesets» (`allowed_merge_methods`, 2025).
