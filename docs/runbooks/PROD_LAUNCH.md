# Первый запуск на AWS (прод)

Порядок первого запуска LawBid на AWS. Почти всё делает Claude на Mac
(Remote Control в папке `/Users/sima/Desktop/iT/Process/LawBid`). Шаги с
пометкой **👤 владелец** требуют рук владельца: вход в аккаунты, DNS,
пароли. Ключи и пароли никогда не пишутся в чат, только в Терминал или в
админку.

Что создаётся (Terraform, `infra/`): сеть (VPC, 1 NAT), балансировщик
HTTPS + WAF, ECS Fargate (api, worker с антивирусом ClamAV, admin),
Redis, S3 (документы и медиа) + CloudFront, Secrets Manager, KMS, SES-домен,
тревоги CloudWatch → e-mail, бюджет. База данных — управляемый PostgreSQL 16
(хостинг выбирает владелец, см. шаг 4), создаётся в консоли хостинга.

Цена в месяц: AWS ≈ $150 при запуске (`launch.tfvars.example`), растёт
сама с нагрузкой до потолков из `terraform.tfvars`; бюджет-тревоги на
50/80/100 % от `monthly_budget_usd`. База данных: цена зависит от выбранного хостинга (см. шаг 4).

## 0. Инструменты на Mac (Claude)

```sh
brew install awscli hashicorp/tap/terraform
cd /Users/sima/Desktop/iT/Process/LawBid && git checkout main && git pull
```

## 1. 👤 Вход в AWS с Mac

В Терминале: `aws login` → откроется браузер → войти в аккаунт AWS
`047754151252` → «Allow». Регион `us-east-1`.

Если `aws login` нет: Консоль AWS → **IAM → Users → Create user**,
имя `sima-mac`, **Attach policies directly → AdministratorAccess** →
Create. Открыть пользователя → **Security credentials → Create access
key → Command Line Interface (CLI)** → Next → Create. В Терминале
`aws configure`: вставить **Access key ID**, **Secret access key**,
регион `us-east-1`, формат `json`.

Проверка (Claude): `aws sts get-caller-identity` показывает `047754151252`.

## 2. Подготовка аккаунта (Claude)

```sh
cd infra/bootstrap && terraform init && terraform apply
terraform output acm_dns_records
```

Создаёт хранилище состояния Terraform, репозитории образов (ECR),
сертификат HTTPS и роль для GitHub Actions. Файл `terraform.tfstate` в
этой папке сохранить (он не секретный).

## 3. 👤 DNS, часть 1: сертификат

Namecheap → **Domain List → lawbid.dev → Manage → Advanced DNS → Add
New Record**, для каждой записи из `acm_dns_records`:

- **Type**: CNAME Record
- **Host**: имя без `.lawbid.dev.` (например `_3f2a….api`)
- **Value**: значение целиком (оканчивается на `.acm-validations.aws.`)
- **TTL**: Automatic

Проверка (Claude): `aws acm wait certificate-validated --certificate-arn <arn>`.

## 4. 👤 База PostgreSQL (хостинг выбирает владелец)

**Решение владельца (ещё не принято):** где живёт боевой PostgreSQL 16.
Варианты: AWS RDS (рядом с остальным, бэкапы и PITR из коробки, нужен
PgBouncer/RDS Proxy), Neon или Supabase (проще и дешевле на старте).
Любой подходит; требования:

- PostgreSQL **16**, регион `us-east-1`, **TLS обязателен** (приложение не
  стартует на staging/production без TLS в `DATABASE_URL`);
- автоматические бэкапы и восстановление на любую минуту (PITR), хранение
  не меньше 30 дней;
- роли: `lawbid_migrator` (миграции), `lawbid_app`, `lawbid_retention`,
  `lawbid_readonly`; таймауты ролей — `infra/postgres/role-settings.sql`
  (выполнить один раз: `psql "$MIGRATOR_URL" -f infra/postgres/role-settings.sql`).

После выбора: создать базу `lawbid_prod`, пользователя `lawbid_migrator`
с паролем и скопировать строку подключения (в ней пароль). Строку **не
присылать в чат** — её спросит скрипт на шаге 6.

Когда хостинг выбран, Claude подключает проверку свежести бэкапа
(`scripts/deploy/check-backup.sh` и почасовую проверку в админке, «Ключи и
сервисы → Хостинг базы данных»): сейчас они только предупреждают.

## 5. Образы и сервер (Claude)

```sh
scripts/deploy/prod-images.sh            # печатает TAG (= коммит)
cd infra/envs/prod
cp backend.hcl.example backend.hcl
cp launch.tfvars.example terraform.tfvars   # заполнить REPLACE: сертификат, TAG, почта тревог
terraform init -backend-config=backend.hcl
# сначала только секреты и Redis — сервисы стартуют, когда ключи уже есть
terraform apply -target=module.stack.module.secrets -target=module.stack.module.redis
../../../scripts/deploy/prod-secrets.sh
```

`prod-secrets.sh` создаёт ключи приложения прямо в Secrets Manager и
кладёт копию трёх незаменимых ключей в «Связку ключей» Mac
(«LawBid prod …»). Их потеря = нечитаемые чаты и ключи админки.

## 6. 👤 База: одна команда в Терминале

```sh
cd /Users/sima/Desktop/iT/Process/LawBid && scripts/deploy/prod-db-setup.sh
```

Вставить строку подключения из шага 4 (её не видно при вставке) → Enter.
Скрипт сам создаёт базы, таблицы, пароли ролей и записывает всё в AWS.

## 7. Полный запуск и данные (Claude)

```sh
cd infra/envs/prod && terraform apply
cd ../../.. && scripts/deploy/prod-run.sh <TAG> seed      # спросит e-mail супер-админа
scripts/deploy/prod-run.sh <TAG> i18n <полный xlsx переводов>
terraform -chdir=infra/envs/prod output -json stack
```

## 8. 👤 Пароль админки: одна команда в Терминале

```sh
cd /Users/sima/Desktop/iT/Process/LawBid && scripts/deploy/prod-run.sh <TAG> admin
```

E-mail (как в seed), логин, пароль (его не видно при вводе).

## 9. 👤 DNS, часть 2: адреса и почта

Namecheap → Advanced DNS → Add New Record:

| Type | Host | Value |
|---|---|---|
| CNAME | `api` | DNS-имя балансировщика (`alb_dns_name`) |
| CNAME | `admin` | то же DNS-имя |
| CNAME ×3 | из `ses_dns` (DKIM) | из `ses_dns` |
| MX / TXT | из `ses_dns` (MAIL FROM) | из `ses_dns` |
| TXT | `_dmarc` | из `ses_dns` |

Почта: письмо **«AWS Notification - Subscription Confirmation»** →
**Confirm subscription** (иначе тревоги не придут).

## 10. 👤 Админка прода

`https://admin.lawbid.dev` → логин и пароль из шага 8 → включить 2FA.

**Безопасность → Ключи и сервисы**: вставить боевые ключи (Twilio,
Firebase JSON, Bunny, **Stripe LIVE** `sk_live_…`, вебхук-секреты).
**Система → Функции**: включить нужные флаги.

Вебхуки:

- Stripe (Live) → **Developers → Webhooks → Add endpoint**:
  `https://api.lawbid.dev/api/v1/webhooks/stripe` (и для Connect:
  `https://api.lawbid.dev/api/v1/webhooks/stripe/connect`) → секрет
  `whsec_…` вставить в админке.
- Bunny → Stream → библиотека → **Webhook URL**:
  `https://api.lawbid.dev/api/v1/webhooks/bunny/<токен из админки>`.

## 11. Автодеплой из GitHub (Claude или 👤)

GitHub → репозиторий → **Settings → Secrets and variables → Actions**:

- Secrets: `AWS_DEPLOY_ROLE_PROD` (= `deploy_role_arn` из шага 2),
  `AWS_REGION` = `us-east-1`, `ECR_REGISTRY` (= `ecr_registry`),
  `PROD_API_URL` = `https://api.lawbid.dev`,
  `PROD_ADMIN_URL` = `https://admin.lawbid.dev`
- Variables: `DEPLOY_ENABLED` = `true`
- **Settings → Environments → New environment** `production` →
  **Required reviewers**: владелец (каждый выпуск подтверждается одной
  кнопкой).

С этого момента каждое слияние в `main` собирает образы и после
подтверждения выкатывает их на прод; откат — **Actions → Rollback
production**.

### Если шаг `configure-aws-credentials` пишет «Not authorized to perform sts:AssumeRoleWithWebIdentity»

Роль или провайдер в аккаунте не совпадают с тем, что описано в
`infra/bootstrap`. Перед запуском шага Deploy печатает шаг «Show the OIDC
claims»: реальный `sub` токена GitHub (ожидается
`repo:syimykkalykov1999/LawBid:ref:refs/heads/main`). Проверка с Mac:

```
aws login                                   # сессия истекает; дальше команды только на чтение
aws sts get-caller-identity                 # аккаунт 047754151252
aws iam list-open-id-connect-providers      # должен быть .../token.actions.githubusercontent.com
aws iam get-role --role-name lawbid-prod-github-deploy \
  --query Role.AssumeRolePolicyDocument     # Federated = провайдер выше, aud = sts.amazonaws.com,
                                            # sub = deploy_trust_sub из terraform output
cd infra/bootstrap && terraform init && terraform plan   # разница с реальностью; apply — только по слову владельца
```

Секрет `AWS_DEPLOY_ROLE_PROD` должен быть ровно `terraform output
deploy_role_arn`.

## Почта (SES)

Пока AWS не выпустил аккаунт из «песочницы», письма уходят только на
адреса, подтверждённые в SES (Консоль → SES → **Identities → Create
identity → Email address**). Вход в админку по логину и паролю работает
без писем. После одобрения AWS письма начинают ходить всем сами,
ничего менять не нужно.

## Повторный `terraform apply`

Сервисы работают на образе последнего выпуска, а `terraform.tfvars` —
на теге первого запуска. Перед `apply` поставить в `api_image` и
`admin_image` текущий тег (из GitHub Actions → последний Deploy), иначе
Terraform вернёт старую версию.
