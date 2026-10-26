# Безопасные выкладки (P1, 2026-10-24)

Три вещи: (1) плохая версия откатывается сама, (2) каждую ночь проверяем, что
AWS не изменили мимо кода, (3) картинки приложения подписаны и имеют SBOM.
Ничего из этого не меняет вид приложения.

---

## 1. Откат плохой версии

### Что выбрали и почему (исследование, октябрь 2026)

| Вариант | Что это | Для нас |
|---|---|---|
| ECS встроенный blue/green (AWS, 17.07.2025; linear/canary — 30.10.2025) | Две полные копии сервиса, переключение ALB, bake time, хуки | Нужен провайдер Terraform 6.x (у нас `~> 5.60`, залочен 5.100), второй target group и listener-правила, двойная цена на время выкладки, и смена типа деплоя на живом сервисе — риск пересоздания. Слишком много для api на ~2 задачи |
| CodeDeploy canary | Старый способ с ALB-весами | Отдельный сервис, роли, `appspec`, меняет контроллер деплоя (пересоздание сервиса). Сложнее всех |
| **ECS rolling + откат по CloudWatch-тревогам (`alarms`) + circuit breaker** | Обычная выкладка (100 % здоровых, +100 % сверху), ECS сам смотрит тревоги во время выкладки и в "bake time" после неё; сработала — откат на прошлую версию | **Выбрано.** Работает на нашем провайдере, без второго target group, без доплаты, без пересоздания сервиса |

Источники: AWS What's New 17.07.2025 «Amazon ECS built-in blue/green deployments»;
AWS What's New 30.10.2025 «built-in Linear and Canary»; AWS ECS Developer Guide
«How CloudWatch alarms detect deployment failures» (поведение, bake time,
ограничения); блог AWS Containers 20.12.2022 «Automate rollbacks for ECS rolling
deployments with CloudWatch alarms»; документация `aws_ecs_service` (blue/green
и `bake_time_in_minutes` — только провайдер 6.x). Переход на blue/green
оставлен «на потом» (когда будет провайдер 6 и реальная нагрузка).

### Что теперь происходит при выкладке

1. Deploy (GitHub Actions) регистрирует новую версию и говорит ECS: «выкатывай».
2. ECS поднимает новые задачи рядом со старыми и смотрит на тревоги:
   - **api:** `api-5xx-ratio` (ошибки > 1 %), `api-p95` (медленно),
     `api-unhealthy-hosts`; по желанию ещё быстрые SLO-тревоги (см. ниже);
   - **worker:** `worker-down-deploy` (нет пульса воркера 3 минуты);
   - **admin:** `admin-5xx-deploy` (> 10 ошибок за 5 минут; писем не шлёт).
3. Первая же тревога в состоянии ALARM -> ECS помечает выкладку FAILED и
   возвращает прошлую версию. Параллельно работает circuit breaker (задачи не
   становятся здоровыми -> тоже откат).
4. Время наблюдения ("bake time") ECS считает сам из периодов тревог
   (задать нельзя, провайдер 5.x): для api примерно 10-15 минут.
5. `scripts/deploy/roll-services.sh` ждёт, пока НАША версия станет COMPLETED.
   Если ECS откатил -> шаг красный («rollout FAILED and was rolled back»), и
   дальше (smoke) не идём. Раньше `aws ecs wait services-stable` показывал
   зелёное и после отката (сервис «стабилен» на старой версии) — это исправлено.

Таймауты: шаг выкладки prod 40 минут (`ROLL_TIMEOUT_SECONDS=2400`), staging 30,
вся job prod 90 минут, build 60.

### Важные оговорки (честно)

- Если тревога УЖЕ в ALARM в момент старта выкладки, ECS **не следит за
  тревогами** в этой выкладке (так задумано AWS: чтобы можно было выкатить
  исправление). Circuit breaker остаётся. Поэтому: во время инцидента сначала
  чиним, а не выкатываем.
- Тревоги «медленные» (5-минутные периоды): плохая версия может получить пару
  минут трафика, пока тревога не сработает. Это не canary с 5 % трафика.
- SLO-тревоги (звонки/пуши/SMS) в откат НЕ входят: они зависят от Twilio, FCM,
  Cloudflare — их сбой откатил бы хорошую версию. Включение:
  `deploy_rollback_on_slo = true` в tfvars. ВНИМАНИЕ: AWS не документирует
  поддержку composite-тревог в `alarms`; сначала проверить на staging, иначе
  ECS их может просто не увидеть.
- Выключить всё: `deploy_alarm_rollback = false` (останется только circuit
  breaker, как было).

### Что покажет terraform plan (проверено на `validate`, plan на AWS не запускался)

- `aws_ecs_service.api / worker / admin`: **update in-place** (добавляется блок
  `alarms`). Слов «must be replaced» быть НЕ должно. Урок со Spot:
  замену вызывал `capacity_provider_strategy`; блок `alarms` в провайдере
  5.x не ForceNew — это обычный UpdateService. Если вдруг в плане есть
  `-/+ replace` у `aws_ecs_service` — НЕ применять, показать мне.
- Новые: `aws_cloudwatch_metric_alarm.admin_5xx_deploy` и
  `worker_down_deploy` (два тихих alarm-а), 0 пересозданий.
- Выход `admin_target_group_arn_suffix` у ALB — только вывод.
- api и worker уже имеют `force_new_deployment = true`, поэтому apply и так
  запускает обычную rolling-выкладку этих двух сервисов; новые тревоги следят
  за ней сразу. `scripts/deploy/plan-guard.sh plan.bin` как обычно.
- Перед apply, как всегда: `scripts/deploy/current-tag.sh` (теги образов).

### Что делать владельцу

Ничего срочного. apply — как обычно, одним сохранённым планом (я готовлю).

---

## 2. Ночная проверка дрейфа Terraform

Workflow `Terraform drift` (`.github/workflows/terraform-drift.yml`), каждую
ночь в 03:00 по Чикаго (два cron в UTC + проверка часа, переход на зимнее
время ничего не ломает). Запуск руками: Actions -> Terraform drift -> Run.

Что делает: `terraform plan -detailed-exitcode` для prod, **только чтение**,
**ничего не применяет**.
- Всё сходится -> тишина (если был открытый issue — закрывается).
- Есть разница -> один issue «Terraform drift on prod» с меткой `infra-drift`
  (GitHub пришлёт письмо), в нём список ресурсов и **названия** изменённых
  полей. Значения (пароли, вебхуки) не печатаются никогда. Если задан секрет
  `DRIFT_SLACK_WEBHOOK` — ещё сообщение в Slack.
- Проверка сама сломалась -> issue «check failed to run» и красный запуск.

Что значит «дрейф»: либо кто-то поменял AWS руками (консоль), либо в `main`
влит инфра-код, который ещё не применён. Оба случая надо разобрать. Известная
безвредная разница (Deploy регистрирует версии задач мимо Terraform) отфильтрована.

Безопасность: роль `lawbid-prod-github-plan` — ReadOnlyAccess + чтение
state/секретов; запись в state-бакет запрещена явным Deny; доверие только к
ветке `main`. Файлы с tfvars удаляются в конце шага, сырой план никуда не
выводится и не сохраняется.

### Что делать владельцу (один раз)

1. Применить `infra/bootstrap` (новая IAM-роль; это IAM, поэтому только вы):
   `cd infra/bootstrap && terraform apply` (в плане должно быть: 1 role,
   1 role_policy, 1 policy_attachment, 1 output).
2. `terraform output plan_role_arn` -> в GitHub: Settings -> Secrets ->
   `AWS_PLAN_ROLE`. Без секрета workflow просто пишет предупреждение и
   пропускает проверку.
3. По желанию: секрет `DRIFT_SLACK_WEBHOOK`.
4. Запустить руками один раз (Run workflow) и убедиться, что результат понятен.

Если роль не хватает прав на какой-то новый сервис AWS, plan упадёт с
`AccessDenied` — это будет issue «check failed»; добавить действие в
`aws_iam_role_policy.plan`.

---

## 3. Подпись образов и SBOM

В `deploy.yml`, после сборки образов api и admin (только если образ собирался
заново):
- **cosign keyless** подпись по digest (Sigstore, личность = GitHub OIDC этого
  workflow на ветке main; ключей хранить не надо);
- **SBOM** (syft, формат SPDX) для каждого образа: файл лежит в артефактах
  запуска и прикреплён к образу в ECR (`cosign attest`);
- в job prod перед миграциями — **проверка подписи** (`cosign verify`,
  тот же workflow на main).

Режим: по умолчанию **мягкий** (`SIGN_REQUIRED` не задана): если подпись или
проверка не удались — жёлтое предупреждение, выкладка идёт. Причина:
ECR и cosign v3 вместе пока не проверены на ваших репозиториях. После первого
успешного запуска (в логе «signature OK») включите строгий режим:
GitHub -> Settings -> Variables -> `SIGN_REQUIRED` = `true`. Тогда
неподписанный образ не выкатится в prod.

Быстро: ~1-2 минуты сверху к сборке (cosign ~секунды, syft ~30-60 с на образ).
Откат (`rollback.yml`) на старые, неподписанные образы проверку не делает.

Известные нюансы:
- В ECR подпись и SBOM — это ещё теги/артефакты. Правило «хранить 60 образов»
  считает их тоже, т.е. вместо 60 релизов хранится примерно 20-30. Если нужно
  дольше — поднять `ecr_keep` в `infra/bootstrap`.
- Workflow «AWS cleanup» удаляет **неотмеченные** образы ECR: подписи, если
  ECR хранит их без тега (OCI referrers), могут пропасть. Проверить после
  первого запуска; при необходимости исключить.
- Проверить руками:
  `cosign verify <реестр>/lawbid-api@sha256:... --certificate-oidc-issuer https://token.actions.githubusercontent.com --certificate-identity-regexp '(?i)^https://github\.com/syimykkalykov1999/LawBid/\.github/workflows/deploy\.yml@refs/heads/main$'`
- Версии действий закреплены по SHA: cosign-installer v4.1.2, sbom-action v0.24.3.

Источники: Sigstore blog «Cosign v3 is now available»; релизы
sigstore/cosign-installer и anchore/sbom-action (GitHub, 2026).

## 4. Зелёный CI перед продом, очередь слияния, оповещения (S11, 2026-10-25)

Что теперь делает репозиторий сам (всё в `.github/workflows`, `scripts/ci`, `scripts/deploy`):

- **Ворота «зелёный CI»**: Deploy и Web deploy сначала ждут, пока все проверки
  этого коммита закончатся зелёными (`scripts/ci/require-green.sh`). Красный
  или непроверенный `main` не доходит до кнопки Approve. Запуск Deploy вручную
  с `image_tag` (готовый образ) ворота пропускает: так выкатывают заведомо
  хорошую версию.
- **`cancel-in-progress` только для PR**: пуш в `main` теперь всегда доезжает до конца.
- **Одна обязательная проверка `API CI`** (зависит от static, e2e 1-3, two-db, n1).
- **N-1** (`n1`): если PR меняет миграции, старый релиз прогоняет свои e2e-тесты
  на новой схеме (`scripts/ci/n1-compat.mjs`). Красный = миграцию надо разбить
  на «добавить сейчас, убрать в следующем релизе».
- **Smoke проверяет версию**: `/health/ready` отдаёт `version` (тег образа);
  smoke ждёт 12 ответов подряд именно от нового тега. Потом синтетический
  пользователь (`scripts/ops/synthetic-check.mjs`), а каждые 5 минут то же самое
  делает `synthetic.yml`.
- **Порядок выкладки**: проверка бэкапа (реальная, `LatestRestorableTime` RDS,
  не старше 26 ч) → снимок базы, если в релизе есть миграция `contract` →
  миграция (30 минут максимум, задача останавливается сама, вторая не стартует,
  пока жива первая) → api → smoke → worker и admin → синтетика → тег пишется в
  SSM `/lawbid-prod/deploy/last_good_tag`.
- **Откат** (`rollback.yml`) имеет свою очередь (`rollback`), не ждёт чужой Deploy;
  с пустым тегом идёт на последний хороший релиз; можно откатить один сервис
  (`services`). Подробно о миграции, которая упала: [migrate-resolve.md](migrate-resolve.md).
- **Оповещения** (`notify-failure.yml`): упавший Deploy/Rollback/Self-check/Drift/
  скан на main/красный CI на main/синтетика → issue с меткой `ci-alert` (по одному
  на вид, без спама) + письмо через SNS `lawbid-prod-alerts` + чат-вебхук. По
  понедельникам приходит «последний зелёный деплой» (heartbeat): тишина = сломано
  само оповещение. Deploy, который ждёт Approve больше 12 часов, отменяется.

### Что должен сделать владелец (GitHub и AWS; Claude может провести по шагам)

1. **Ruleset на `main`** (Settings -> Rules -> Rulesets -> New branch ruleset, Target:
   `main`): Require a pull request; Require status checks: `API CI`, `Admin CI`,
   `gitleaks`, `Analyze, lint checks, unit/widget/golden tests`;
   Require merge queue; Block force pushes. (Создать его может только владелец.)
   CodeQL и Container scan (`Build image + Trivy`) не обязательные: они идут только
   после слияния в main и раз в день, не на каждом PR.
2. **Merge queue**: включается в том же ruleset (Require merge queue, метод Squash).
   Во всех CI-workflow, которые идут на PR, уже есть триггер `merge_group`.
3. **Environment `production`** -> Deployment branches and tags -> Selected branches
   -> `main` (то же для `release` и `load-test`). Это вторая половина защиты: первая
   в Terraform (`job_workflow_ref`, `infra/bootstrap`): роль деплоя отдаётся только
   workflow-файлам `deploy.yml`, `rollback.yml`, `web-deploy.yml`... из `main`.
   Новый workflow, которому нужна роль, надо сначала добавить в `deploy_workflows`.
4. **Terraform apply** в `infra/bootstrap` (новые права: StopTask/ListTasks, RDS
   describe+snapshot, SSM `/lawbid-prod/deploy/*`, роль `lawbid-prod-github-notify`).
   Claude делает plan, вы подтверждаете.
5. **Секреты/переменные GitHub**: `AWS_NOTIFY_ROLE` (output `notify_role_arn`),
   `ALERT_WEBHOOK_URL` (по желанию), `SYNTHETIC_IDENTIFIER` + `SYNTHETIC_PASSWORD`
   (отдельный тестовый аккаунт с паролем, не живой пользователь), переменные
   `BACKUP_CHECK_STRICT=true` (после apply), `DEPENDABOT_AUTOMERGE=true` (после
   ruleset и Settings -> General -> Allow auto-merge), `FLAG_FIRST_ENFORCE=true`
   (когда привыкнем).
6. **`SIGN_REQUIRED=true`** (Variables) после первого запуска Deploy, где в логе
   «signature OK»; затем `signing_guard_enabled = true` в Terraform (тревога, если
   задача запущена из образа без подписи).

### Стоимость (S11)

| Что | Включено по умолчанию | Выключатель | Цена в месяц (старт / 1 млн пользователей) | Тревога |
|---|---|---|---|---|
| Синтетика каждые 5 мин (`synthetic.yml`) | нет | переменная `SYNTHETIC_ENABLED=true` | публичный репозиторий: $0 (около 8 600 мин Actions); приватный: около $70 | `[ci-alert:synthetic]` |
| CI API (5 параллельных job вместо одного) | да, на PR/пуш | пути в `api-ci.yml` | публичный: $0; минут примерно в 1,5-2 раза больше прежнего | красный `API CI` |
| EventBridge + Lambda «образ без подписи» | нет | `signing_guard_enabled` в Terraform | меньше $0,10 / меньше $0,10 (вызовов столько же, сколько запусков задач) | письмо в `lawbid-prod-alerts` |
| Параметры SSM `last_good_tag` | да | нет (Standard = бесплатно) | $0 / $0 | нет |
| Снимок RDS перед миграцией `contract` | да, только при такой миграции | переменная `PRE_MIGRATE_SNAPSHOT=false` | около $0,095 за ГБ в месяц, пока снимок жив (100 ГБ ≈ $9,5 за неделю хранения ≈ $2) / растёт с базой: удаляйте через неделю | `snapshot ... not available` в Deploy |
| SNS-оповещения, heartbeat, ночной карантин | да | нет секретов = нет канала | $0 / копейки | сам heartbeat |
