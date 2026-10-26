# Деплой API и админки на прод (для Mac-треда)

Для случая, когда прод-админка на AWS уже стоит, боевые ключи введены в её
базу, а выкладка из GitHub не проходит (`Not authorized to perform
sts:AssumeRoleWithWebIdentity`, диагноз: `/mnt/project-files/plan/deploy-oidc-diagnosis.md`).
Первый запуск с нуля описан в [PROD_LAUNCH.md](PROD_LAUNCH.md). Ничего из
этого не делает облачный тред: нужны ключи AWS владельца на Mac.

## Что проверено по коду (почему деплой не трогает данные)

| Что | Вывод | Где |
|---|---|---|
| База | Terraform `envs/prod` **не управляет** базой: `create_database` по умолчанию `false` и из `envs/prod` не передаётся. `apply` её не создаёт, не меняет, не удаляет. Если база всё же RDS из Terraform, у неё `deletion_protection = true` и финальный снимок | `modules/stack` (переменная), `modules/postgres` |
| Секреты | Terraform создаёт только «оболочки» секретов Secrets Manager без значений (`aws_secretsmanager_secret`, нет `_version`). Значения (в т. ч. `SECRETS_MASTER_KEYS`) `apply` не перезаписывает; `prod-secrets.sh` существующее не заменяет | `modules/secrets`, `scripts/deploy/prod-secrets.sh` |
| Деплой из GitHub | `roll-services.sh` берёт текущее описание задачи, меняет только образ и `APP_VERSION`; `secrets` и `environment` остаются как были | `scripts/deploy/roll-services.sh` |
| Миграции | Только отдельной задачей `lawbid-prod-migrate` (`prisma migrate deploy`, роль `lawbid_migrator`) до выкладки сервисов. API и worker сами схему не меняют | `run-migrations.sh`, `Dockerfile` |
| Откат | Circuit breaker ECS возвращает прошлую ревизию; вручную: Actions → Rollback production | `modules/ecs`, `rollback.yml` |

**Ловушки (исправлены или описаны ниже):**

1. `terraform apply` в `envs/prod` вернёт **старый образ** (тег из `terraform.tfvars`), потому что Deploy создаёт ревизии вне Terraform. Перед каждым `apply` — `scripts/deploy/current-tag.sh`, подставить теги в `terraform.tfvars`.
2. Теги в ECR неизменяемые: повторный запуск Deploy на том же коммите раньше падал на push. Теперь `deploy.yml` пропускает сборку, если образы уже есть.
3. Если окружение GitHub `production` не создано вручную, GitHub создаст его **без** проверяющих, и подтверждения перед выкладкой не будет. Создать заранее (шаг 4).
4. Ключ `SECRETS_MASTER_KEYS` должен содержать идентификатор `k1` (так задано в `SECRETS_ACTIVE_KID`), иначе введённые в админке ключи не расшифруются. Проверка в шаге 1.
5. Пока `DEPLOY_ENABLED=true`, каждый merge в `main` с изменениями в `apps/api`, `apps/admin`, `packages` запускает Deploy. Падающий OIDC даёт красные запуски и письма. После починки он идёт до ручного подтверждения.

## Шаг 0. Вход

```sh
cd /Users/sima/Desktop/iT/Process/LawBid && git checkout main && git pull
aws sts get-caller-identity   # Account должен быть 047754151252
```

## Шаг 1. Только чтение: что реально есть в AWS

```sh
aws iam list-open-id-connect-providers
aws iam get-role --role-name lawbid-prod-github-deploy --query Role.AssumeRolePolicyDocument
aws secretsmanager list-secrets --query "SecretList[?starts_with(Name,'lawbid-prod/')].Name" --output text
# значения не печатаем, только идентификаторы ключей (до двоеточия):
for N in SECRETS_MASTER_KEYS JWT_KEYS MESSAGE_ENC_KEYS; do
  printf '%s: ' $N; aws secretsmanager get-secret-value --secret-id lawbid-prod/$N --query SecretString --output text | cut -d: -f1
done                          # ждём: k1, j1, m1
aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus,DeletionProtection]' --output text
aws ecs describe-services --cluster lawbid-prod --services api worker admin --query 'services[].[serviceName,runningCount,taskDefinition]' --output text
```

Сверка: провайдер `token.actions.githubusercontent.com` есть; в доверии роли
`aud = sts.amazonaws.com` и `sub` содержит `repo:syimykkalykov1999/LawBid:ref:refs/heads/main`
и `...:environment:production`. Расхождение = причина ошибки. Если секреты
`lawbid-prod/*` называются иначе или `k1/j1/m1` не совпали, остановиться и
написать в тред: деплой возможен, но ключи админки придётся вводить заново.

**Снимок базы перед любыми изменениями** (бесплатная страховка):

```sh
aws rds create-db-snapshot --db-instance-identifier <id из вывода выше> --db-snapshot-identifier before-first-deploy-$(date +%Y%m%d)
```

## Шаг 2. Починить OIDC-роль (bootstrap)

Состояние `infra/bootstrap` локальное (`terraform.tfstate` рядом с `main.tf`, в git его нет).

```sh
cd infra/bootstrap && ls terraform.tfstate   # есть файл? тогда просто plan
terraform init
terraform plan -out=plan.bin -target=aws_iam_openid_connect_provider.github -target=aws_iam_role.deploy -target=aws_iam_role_policy.deploy
terraform show plan.bin | grep -E "will be|must be|Plan:"
```

- Файла состояния **нет**, а роль/провайдер в AWS есть: сначала импорт, иначе `apply` упадёт с `EntityAlreadyExists`:
  ```sh
  terraform import aws_iam_openid_connect_provider.github arn:aws:iam::047754151252:oidc-provider/token.actions.githubusercontent.com
  terraform import aws_iam_role.deploy lawbid-prod-github-deploy
  ```
  затем снова `plan`.
- Допустимо в плане: создание/изменение провайдера, роли (`assume_role_policy`) и её политики. **Стоп**, если в плане есть `destroy` или `replace` чего-либо, кроме `aws_iam_role_policy.deploy`.
- Применение: `terraform apply plan.bin`. Ничего, кроме выбранных трёх ресурсов, не меняется (`-target`), бакеты, ECR и сертификат не трогаются.

```sh
terraform output deploy_role_arn ecr_registry
```

## Шаг 3. Секреты и переменные GitHub

GitHub → `syimykkalykov1999/LawBid` → Settings → Secrets and variables → Actions
(на Mac через `gh secret set`, значения не печатать):

| Тип | Имя | Значение |
|---|---|---|
| Secret | `AWS_DEPLOY_ROLE_PROD` | `deploy_role_arn` (`arn:aws:iam::047754151252:role/lawbid-prod-github-deploy`) |
| Secret | `AWS_REGION` | `us-east-1` |
| Secret | `ECR_REGISTRY` | `047754151252.dkr.ecr.us-east-1.amazonaws.com` |
| Secret | `PROD_API_URL` | `https://api.lawbid.dev` |
| Secret | `PROD_ADMIN_URL` | `https://admin.lawbid.dev` |
| Variable | `DEPLOY_ENABLED` | `true` |
| Variable | `STAGING_ENABLED` | не задавать (staging нет) |

## Шаг 4. Окружение `production` с подтверждением

Settings → Environments → New environment → `production` → Required reviewers
= владелец. Без этого выкладка пойдёт без подтверждения (ловушка 3).

## Шаг 5. Деплой

Сначала должен быть смержен PR с этим runbook и #180 (Deploy берёт `main`).

```sh
gh workflow run Deploy --ref main          # или Actions → Deploy → Run workflow
gh run watch
```

В логе шаг `OIDC diagnostics` печатает `sub` токена; `configure-aws-credentials`
должен пройти. Дальше job `Deploy production` ждёт кнопки владельца (Review
deployments), затем: проверка бэкапа (только предупреждение), миграции
(задача `lawbid-prod-migrate`), rolling-выкладка api/worker/admin, smoke.

Если `sub` в логе отличается от доверия роли, поправить `github_repo` в
`infra/bootstrap` или переменную и повторить шаг 2.

## Шаг 6. Проверка

```sh
curl -fsS https://api.lawbid.dev/health/ready
curl -fsS https://api.lawbid.dev/api/v1/config/bootstrap | head -c 300
curl -sS -o /dev/null -w "%{http_code}\n" https://admin.lawbid.dev/login
aws ecs describe-services --cluster lawbid-prod --services api worker admin --query 'services[].[serviceName,runningCount,desiredCount,deployments[0].rolloutState]' --output text
aws logs tail /lawbid/lawbid-prod/migrate --since 30m
```

Затем в админке (шаг-чеклист ниже): карточки ключей не серые, вход работает.

## Чеклист прод-переменных и настроек

**Задаёт Terraform/Secrets Manager (проверить, не вводить):**

| Что | Где | Значение |
|---|---|---|
| `NODE_ENV` | `modules/stack` | `production` (при другом значении API требует TLS, MESSAGE_ENC_KEYS и запрещает mock) |
| `SECRETS_MASTER_KEYS` | секрет `lawbid-prod/SECRETS_MASTER_KEYS` | `k1:<≥32 симв.>` |
| `SECRETS_ACTIVE_KID` | `modules/stack` | `k1` (без пары с мастер-ключом кнопки «Добавить ключи» серые) |
| `MESSAGE_ENC_KEYS` / `JWT_KEYS` | секреты | `m1:…` / `j1:…`, не менять: чаты станут нечитаемыми |
| `DATABASE_URL` и др. | секреты | `sslmode=verify-full`; их создаёт `prod-db-setup.sh` |
| `TRUST_PROXY_HOPS` | `modules/stack` | `1` |
| `CLAMAV_HOST` | worker task | `127.0.0.1` (сайдкар ClamAV) |
| `S3_CORS_ALLOWED_ORIGINS` | `s3_cors_allowed_origins` в tfvars | добавить `https://lawbid.dev` и хост веба, когда он появится |

**Не API-переменная:** `WEB_ENABLED` — флаг сборки Flutter-веба
(`--dart-define=WEB_ENABLED=true`), уже включён в `web-deploy.yml`. Для прода
он включается публикацией веба на lawbid.dev, а не переменной API.

**Вводит владелец в админке** (Безопасность → Ключи и сервисы), в чат не присылать:
Twilio, Stripe `sk_live_…` + `whsec_…` (оба вебхука), Firebase JSON (проект `lawbid-6e5ff`), Bunny, Sentry DSN, Stripe `pk_…` (своя страница оплаты). Если база админки прежняя, ключи уже там; после шага 6 открыть карточки и убедиться, что они «заполнены». Сбросились → вводить заново по списку выше.

**Настройки (app_config), проверить в админке после деплоя:**

- `fraud.enabled = true`. Умолчание в коде `true` (`app-settings.defaults.ts`), но в старой базе строка могла остаться `false`. Админка → антифрод → включить.
- Лимиты SMS/видео/хранилища: Настройки → бюджетные лимиты (`budget.<provider>.<window>`).
- Роли тестовых аккаунтов и демо-данные в прод не переносить; прод-данные пользователей не удалять без явного «да».

## Повторные `terraform apply` в envs/prod

```sh
cd infra/envs/prod
../../../scripts/deploy/current-tag.sh        # подставить api_image / admin_image в terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan -out=plan.bin
../../../scripts/deploy/plan-guard.sh plan.bin   # падает, если удаляются база, секреты, KMS, Redis, S3
terraform apply plan.bin
```

## Надёжность (2026-10-22): Multi-AZ, копии базы в другом регионе, очередь, endpoints

Что меняется и сколько стоит — [infra/README.md](../../infra/README.md)
«Надёжность, 2026-10-22» (итого ≈ +$45–50 в месяц на стартовом размере:
Multi-AZ ≈ ×2 цены базы, копии ≈ $3–6, VPC endpoints ≈ $29). Terraform
прод-базу **не меняет**: она вне Terraform, её настройки включаются в
консоли, Terraform только делает копии и проверяет.

**Порядок (строго по шагам):**

1. **Консоль RDS** (5 минут, без остановки сайта): Multi-AZ, хранение 14
   дней, окно бэкапа 03:10 UTC, защита от удаления —
   [backups.md](backups.md) «Консоль RDS». Проверка:
   ```sh
   aws rds describe-db-instances --db-instance-identifier lawbid-prod-postgres \
     --query 'DBInstances[0].[MultiAZ,BackupRetentionPeriod,DeletionProtection,LatestRestorableTime]' --output text
   ```
   ждём `True  14  True  <время не старше 5 минут>`.
2. **terraform.tfvars** (`infra/envs/prod`): добавить
   ```hcl
   interface_endpoints          = ["ecr.api", "ecr.dkr", "logs", "secretsmanager"]
   interface_endpoint_azs       = 1
   existing_database_identifier = "lawbid-prod-postgres"
   backup_enabled               = true
   backup_retention_days        = 35
   worker_jobs_per_task         = 50
   ```
   (`backup_copy_account_id` — только когда создан резервный аккаунт, см.
   backups.md.)
3. **План** (ничего не меняет):
   ```sh
   cd infra/envs/prod
   ../../../scripts/deploy/current-tag.sh        # подставить текущие теги образов
   terraform init -backend-config=backend.hcl
   terraform plan -out=plan.bin
   ../../../scripts/deploy/plan-guard.sh plan.bin
   ```
   Ожидаемо в плане: **создать** `module.stack.module.backup[0]` (2 хранилища
   копий, план, выбор, роль, правило EventBridge, тревога),
   `aws_sns_topic_policy.alerts`, метрика `queue-waiting-total`, правило
   `worker-queue`, 4 VPC endpoint; **изменить на месте** политику ключа KMS.
   Ни одного `destroy` / `replace`. Если есть
   `Warning: Check block assertion failed` — шаг 1 не доделан (план всё
   равно можно применять). Иначе — стоп и написать Claude.
4. **Применить:** `terraform apply plan.bin`.
5. **Выложить код API** (Actions → Deploy): обработчик начинает писать
   длину очереди; правило масштабирования начинает работать после этого.
6. **Наутро** (после 06:00 UTC): AWS Console → AWS Backup → Jobs — задача
   `Completed`, копия в us-west-2 (Copy jobs) — `Completed`. Тревога
   `lawbid-prod-db-backup-age` в первую ночь может прийти — это нормально.
7. **Учебное восстановление:** `scripts/ops/restore-drill.sh`, строку —
   в [restore-drill.md](restore-drill.md).

Откат: в `terraform.tfvars` `backup_enabled = false`,
`worker_jobs_per_task = 0`, `interface_endpoints = []` → `plan` / `apply`.
Хранилища с копиями Terraform удалить не сможет (защита AWS и plan-guard) —
так и задумано. Multi-AZ выключается в консоли RDS → Modify.

## Безопасность (security research #5, 2026-10-22): WAF, журнал облака, контейнер

Код в `infra/` уже содержит всё ниже; применяется обычным `terraform apply`
(раздел «Повторные `terraform apply`»). `plan-guard.sh` ничего не удаляет —
только добавляет ресурсы. Что появится:

| Что | Где | Переменная (terraform.tfvars) | По умолчанию |
|---|---|---|---|
| Лимит на выдачу кодов на ALB WAF: `/auth/otp/request`, `/auth/password/reset/request`, `/auth/phone/status`, `/auth/identifiers` — не больше N запросов с одного IP за 5 минут | `modules/alb` | `waf_otp_rate_limit_per_5m` | 20 |
| AWS Bot Control (платно, ~$10/мес + $1 за млн запросов): сначала только считает, потом блокирует | `modules/alb` | `waf_bot_control_enabled`, `waf_bot_control_block` | выкл / выкл |
| WAF на CloudFront (веб-версия и медиа): лимит с IP, список плохих адресов, известные атаки | `modules/cdn-waf` | `cdn_waf_rate_limit_per_5m` | 2000 |
| CloudTrail (журнал всех вызовов AWS, 365 дней, свой KMS-ключ), GuardDuty (детектор, S3 + RDS-логины; сканирование дисков выкл), IAM Access Analyzer, парольная политика IAM; находки severity ≥ 7 и всё от Access Analyzer — на почту алармов | `modules/security-baseline` | `guardduty_alert_severity`, `security_hub_enabled` | 7 / выкл |
| Контейнеры api / worker / admin / migrate с файловой системой только для чтения (`/tmp` и кэш Next — отдельные тома) | `modules/ecs` | `ecs_readonly_root_filesystem` | вкл |
| DMARC `p=reject` вместо `quarantine` — через 4 недели чистых отчётов на `dmarc_rua` | `modules/ses` | `dmarc_policy` | `quarantine` |

Если после apply задача `api`/`worker`/`admin` не поднимается с ошибкой
вида `EROFS: read-only file system` в логах — поставить
`ecs_readonly_root_filesystem = false`, применить, и сообщить разработчику
путь из ошибки (его надо добавить в тома).

**Перец для хэшей телефонной книги (A7).** API хранит хэши контактов с
серверным секретом `CONTACTS_PEPPER` (≥ 32 символов). Пока его нет, API
пишет в журнал предупреждение и работает как раньше. Включить:

1. `aws secretsmanager create-secret --name lawbid-prod/CONTACTS_PEPPER --secret-string "$(openssl rand -hex 32)"` (secret должен существовать со значением ДО того, как попадёт в tfvars — иначе ECS не запустит задачи).
2. В `terraform.tfvars` добавить `"CONTACTS_PEPPER"` в `extra_secrets`, `terraform apply`.
3. После выкладки старые строки перехэшируются сами (задача `contacts.pepper-backfill`, по 2000 строк каждые 5 минут); менять секрет потом нельзя — старые строки станут бесполезны. Когда строк без перца не осталось, задача сама пишет отметку «готово» (таблица `search_index_state`, ключ `ops:contacts-pepper-backfill`) и дальше ничего не делает. Если потом загрузить старую базу, разбудить её: убрать эту строку отметки из таблицы `search_index_state`.

**Вручную в консоли AWS (не Terraform):** на root-аккаунте — MFA
(passkey или аппаратный ключ) и ни одного access key; для людей — IAM
Identity Center (SSO) вместо IAM-пользователей; подтвердить подписку на
e-mail алармов (письмо от SNS после apply).

## CloudFront для приватных файлов (2026-10-22, чеклист систем §22)

Фото, голосовые и файлы в чатах, файлы дел и документы лежат в бакете
`documents`. Раньше каждая ссылка подписывалась самим S3 (presigned GET).
Теперь их может отдавать CloudFront с «подписанными URL»: API подписывает
ссылку своим ключом, CloudFront проверяет подпись и кэширует байты на
краю (файлы неизменяемые, `Cache-Control: immutable` сохраняется). Пока
ключа нет — всё работает по-старому, ничего делать не обязательно.

Включить (один раз, ~10 минут):

1. Сделать пару ключей RSA-2048 на своём компьютере (приватный ключ никуда
   не отправлять, кроме Secrets Manager):
   ```sh
   openssl genrsa -out cloudfront-signing.pem 2048
   openssl rsa -pubout -in cloudfront-signing.pem -out cloudfront-signing.pub.pem
   ```
2. Положить приватный ключ в Secrets Manager и сразу «импортировать» его в
   Terraform (иначе apply скажет, что секрет уже есть):
   ```sh
   aws secretsmanager create-secret --name lawbid-prod/CLOUDFRONT_PRIVATE_KEY_PEM \
     --secret-string file://cloudfront-signing.pem
   cd infra/envs/prod
   terraform import 'module.stack.module.secrets.aws_secretsmanager_secret.this["CLOUDFRONT_PRIVATE_KEY_PEM"]' lawbid-prod/CLOUDFRONT_PRIVATE_KEY_PEM
   ```
3. В `terraform.tfvars` добавить две строки и применить
   (`terraform plan` → `plan-guard.sh` → `apply`):
   ```hcl
   documents_cdn_public_key_pem = file("cloudfront-signing.pub.pem")
   extra_secrets                = ["CLOUDFRONT_PRIVATE_KEY_PEM"]   # к уже перечисленным
   ```
   Terraform создаст: публичный ключ и группу ключей CloudFront, дистрибутив
   с OAC к бакету `documents`, политику бакета (читать может только этот
   дистрибутив). В переменные API попадут `CLOUDFRONT_PRIVATE_DOMAIN`,
   `CLOUDFRONT_PRIVATE_KEY_ID` (из `terraform output documents_cdn_domain`
   / `documents_cdn_key_pair_id`) и секрет `CLOUDFRONT_PRIVATE_KEY_PEM`.
4. После выкладки открыть в приложении любой чат с фото: ссылка на файл
   должна начинаться с `https://d….cloudfront.net/…?…&Signature=…`.
   В админке → Безопасность → Ключи и сервисы → «File storage» видны те же
   три поля; их можно заполнить и там вместо переменных (приоритет у
   админки), а очистив — вернуться к ссылкам S3.

Выключить: убрать `documents_cdn_public_key_pem` из tfvars и применить
(дистрибутив удалится, ссылки снова подпишет S3). Сменить ключ: новая пара
→ шаги 2–3 с новым публичным ключом; старые ссылки живут не дольше часа.

## Ключи шифрования через KMS (2026-10-22, SECURITY_TODO «KMS-wrapped keys»)

Секреты `MESSAGE_ENC_KEYS` (тексты чатов) и `SECRETS_MASTER_KEYS`
(хранилище ключей админки) до сих пор хранят «сырые» ключи. Теперь любой
элемент может быть зашифрован ключом KMS: `m2:kms:<base64 шифротекста>`.
API расшифровывает его один раз при старте (`kms:Decrypt`), держит только
в памяти; сырые записи `m1:<секрет>` продолжают работать, поэтому переход
постепенный. Terraform создал отдельный ключ `alias/lawbid-prod-data-keys`
(`terraform output data_keys_kms_key_arn`); роль задач может им только
расшифровывать, и только с контекстом `app=lawbid-prod`.

Перейти на обёрнутый ключ для чатов:

1. Сделать новый ключ и зашифровать его:
   ```sh
   RAW=$(openssl rand -hex 32)
   aws kms encrypt --key-id alias/lawbid-prod-data-keys \
     --encryption-context app=lawbid-prod \
     --plaintext "fileb://<(printf %s "$RAW")" \
     --query CiphertextBlob --output text
   ```
   (команда печатает base64 — это и есть `<шифротекст>`).
2. Дописать его в секрет, НЕ удаляя старый `m1:…`:
   `aws secretsmanager put-secret-value --secret-id lawbid-prod/MESSAGE_ENC_KEYS --secret-string "m1:<старое>,m2:kms:<шифротекст>"`.
3. В `infra/modules/stack/main.tf` переключить `MESSAGE_ENC_ACTIVE_KID = "m2"`,
   `terraform apply`, дождаться новых задач.
4. Админка → Система → Здоровье системы → плитка «Ключи сообщений»: задача
   `messages.reencrypt` каждые 5 минут переписывает старые строки
   (`enc:v2…` и строки под `m1`) на новый ключ; счётчики «переписано /
   ошибок / осталось». Когда для `m1` показано 0 строк и проход завершён —
   `m1` можно убрать из секрета. Раньше — нельзя: старые чаты станут
   нечитаемыми.

Для `SECRETS_MASTER_KEYS` — то же самое с `k2:kms:…` и
`SECRETS_ACTIVE_KID = "k2"`, после чего в админке → Ключи и сервисы нажать
«Перешифровать» (кнопка уже есть). Локально и в тестах ничего не меняется:
без префикса `kms:` KMS не вызывается.

## Отказоустойчивость и звонки (2026-10-22): реплика Redis, второй TURN, LiveKit, ARM

Всё ниже **выключено** и не стоит денег, пока вы не добавите строку в
`terraform.tfvars`. Каждый пункт независим; применяйте по одному
(`terraform plan`, смотрим «0 to destroy», `apply`). Заходить:
`cd ~/Desktop/LawBid/infra/envs/prod && eval "$(aws configure export-credentials --format env)" && terraform init -backend-config=backend.hcl`.

| Что | Строка в tfvars | Добавка в месяц | Подробности |
|---|---|---|---|
| Реплика Redis с автопереключением | `redis_replicas = 1` | ≈ **+$12** (`cache.t4g.micro`) | [redis.md](redis.md) |
| ~~Второй сервер TURN~~ **не нужен с 2026-10-24**: звонки идут через Cloudflare TURN, свой coturn удалён (`turn_enabled = false`, `turn_second_enabled = false`) | — | **$0** (Cloudflare: первые 1000 ГБ в месяц бесплатно, дальше $0.05/ГБ) | [TURN.md](TURN.md) |
| Свой сервер групповых звонков LiveKit | `livekit_enabled = true` | ≈ **+$32** + трафик | [LIVEKIT.md](LIVEKIT.md) |
| Проверка «жив ли сервер» дешевле | `uptime_check = "route53"` | ≈ **−$8** | [slo.md](slo.md) |
| Серверы Fargate на Graviton | `cpu_architecture = "ARM64"` | ≈ **−20 %** платы за Fargate (−$10…15 на старте) | ниже |
| Container Insights выключен (по умолчанию) | `container_insights = "disabled"` | ≈ **−$30** | ниже |
| Лишние задачи на Fargate Spot | `api_spot = true`, `worker_spot = true` | до −70 % за каждую Spot-задачу | ниже |

Реплика Redis = ≈ **+$12**. Второй TURN снят (звонки через Cloudflare, см. TURN.md).
Все платные пункты вместе ≈ +$45 + трафик звонков.

**Бюджет.** `monthly_budget_usd` по умолчанию теперь **350** (было 200):
реальный запуск ≈ $270–285 (AWS ≈ $265: серверы, база в двух зонах, NAT, балансировщик,
публичные адреса IPv4, два WAF, тревоги и журналы; плюс Apple, домен, Bunny, SMS-номер;
полная таблица в COST_LADDER.md), и при 100 % бюджета система держит
сервер на минимуме, то есть слишком низкий бюджет сам тормозит рост. Письма
придут на $175 / $280 / $350: первое письмо (50 %) придёт уже около 20-го числа
при обычном месяце, это нормально; не хотите ранних писем, поднимите бюджет до $450. Если в вашем `terraform.tfvars` стоит своя
цифра, она важнее: замените 200 на 350 там.

**Шаги.**
1. `redis_replicas = 1`: `plan` покажет одно изменение Redis (реплика) и новый
   сигнал; `apply`. Приложение ничего не заметит.
2. ~~`turn_second_enabled = true`~~ — больше не нужно: звонки через Cloudflare TURN
   (админка → Интеграции → `cloudflare_turn`). Вернуть свой coturn: TURN.md, «Bringing our own coturn back».
3. `livekit_enabled = true`: `apply`, затем две A-записи `livekit` и
   `livekit-turn` на адрес `livekit_public_ip` (шаги в LIVEKIT.md). В `plan`
   будет и новая ревизия задач API/worker: туда добавляются три переменные
   `LIVEKIT_*`.
4. **ARM64** (порядок важен, иначе задачи не запустятся):
   a. Смёржить изменение `deploy.yml`: образы собираются под `linux/amd64` и
      `linux/arm64`. Любой деплой после этого даёт multi-arch образы.
   b. Образ ClamAV `clamav/clamav:1.4` у разработчиков ТОЛЬКО под amd64
      (проверено 2026-10-24, так же `latest` и `1.5`). Берём тот же ClamAV из
      `clamav/clamav-debian:1.4`: там есть amd64 и arm64, внутри тот же
      `clamdcheck.sh`. Одна команда (или GitHub → Actions → «Mirror ClamAV» →
      Run workflow; `scripts/deploy/prod-images.sh` делает то же):
      `docker buildx imagetools create -t <ECR>/lawbid-clamav:1.4-debian clamav/clamav-debian:1.4`.
      Потом в tfvars: `clamav_image = "<ECR>/lawbid-clamav:1.4-debian"`.
      Лучше применить это ДО перехода на ARM64 (проверить сканер на x86).
   c. Убедиться, что в `api_image` / `admin_image` стоит тег, собранный
      **после** (a): `docker buildx imagetools inspect <образ>` показывает
      `linux/arm64`. Старый тег = только amd64.
   d. `cpu_architecture = "ARM64"`, `apply`: Fargate заменит задачи по очереди.
      Откат: `cpu_architecture = "X86_64"`, `apply`.
   Сборка arm64 в GitHub Actions идёт через эмуляцию (QEMU), деплой-сборка
   станет заметно дольше (минуты). Если мешает, перейти на arm-раннеры.

**Проверка расходов через месяц:** Billing → Cost Explorer → по сервисам;
сравнить с таблицей выше.

## Выкат без «связь пропала» (2026-10-23)

- При остановке задачи API (деплой, scale-in) каждый сокет получает `server:going-away` со случайной задержкой 0–20 с и уходит сам; экземпляр ждёт до ~35 с.
- Поэтому в Terraform: ECS `stopTimeout` api = **60 с** (`infra/modules/ecs/main.tf`) и ALB `deregistration_delay` api = **60 с** (`infra/modules/alb/main.tf`). Не уменьшать: SIGKILL не должен прийти раньше конца слива. Модули общие для prod и staging.
- После выката на доске «Состояние системы» «Живое соединение» несколько минут будет всплеск возвратов — это нормально. Подробности: [REALTIME_LIFECYCLE.md](REALTIME_LIFECYCLE.md).
- Scale-in медленный (10 минут) намеренно; перед пиком поднимайте минимум расписанием, а не давайте политике сжать сервис.

### Дешёвые переключатели: Insights, Spot (2026-10-24)

- **Container Insights** (`container_insights`, по умолчанию `"disabled"`):
  платил ≈ $30 в месяц за 108 метрик. Автомасштабирование воркера и тревоги
  «нет запущенных задач» теперь не зависят от него (воркер считает себя по
  метрике `LawBid/Runtime`, API проверяется по здоровым хостам ALB). Для
  разбора проблем поставьте `container_insights = "enabled"`, `apply`, потом
  верните обратно.
- **Spot** (`api_spot`, `worker_spot`): первая задача всегда обычный Fargate,
  остальные пополам: обычный и Spot (1:1). Если Spot-мощности нет, ECS не
  переключается на обычный сам, поэтому половина новых задач всё равно
  запустится. Spot-задачу AWS может забрать с предупреждением за 2 минуты;
  очередь воркера повторяет прерванную работу. Включение на живом сервисе
  идёт обычным «rolling»-обновлением без простоя (в коде стоит
  `force_new_deployment`; иначе провайдер пересоздал бы сервис). Перед
  `apply` в `plan` должно быть `update in-place` для `aws_ecs_service`, а не
  `must be replaced`.
