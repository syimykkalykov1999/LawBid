# AWS guardrails (2026-10-25): Config, break-glass, SCP, Athena, Cost Anomaly

Всё в Terraform, ничего не применено. Дефолты: платное выключено, бесплатное включено.

## Краткое для владельца

| Что | Переменная (envs/prod) | По умолчанию | Цена в месяц |
|---|---|---|---|
| AWS Config + 11 managed-правил | `config_enabled` | выкл | ~$1-4 |
| Break-glass роль | `break_glass_enabled` + `break_glass_principal_arns` | выкл | $0 |
| Athena по CloudTrail + 5 сохранённых запросов | `cloudtrail_athena_enabled` | вкл | ~$0 (запрос стоит доли цента; $5 за ТБ скана) |
| Cost Anomaly в SNS (alerts) | `anomaly_to_alerts_topic` | вкл | $0 |
| SCP организации (`modules/org-guardrails`) | не в стеке | нет Organization | $0 |

Config: цены AWS Config (us-east-1): $0.003 за запись конфигурации при непрерывной записи, $0.012 при ежедневной, $0.001 за проверку правила, бесплатного уровня нет. Мы пишем только 6 типов (IAM user/group/role/policy, S3 bucket, RDS instance) раз в сутки и только при изменении; периодических правил 5 (по 30 проверок в месяц), остальные срабатывают при изменении ресурса. Итого порядка $1-4; в первый месяц чуть больше (первичная оценка всех ресурсов).

## Шаги владельца (apply)

1. `terraform plan` в `infra/envs/prod`: должны появиться только Athena/Glue/results-bucket, CE subscription `*-cost-anomalies-sns`, правки политик SNS alerts и KMS (costalerts). Проверь, что plan не трогает ничего чужого.
2. apply. Подтверди письмом/SNS при необходимости.
3. Config: поставь `config_enabled = true`, apply. Если prod и staging в одном аккаунте, включай Config только в одном (рекордер один на аккаунт и регион). Проверь консоль AWS Config, Rules: 11 правил, исходно часть может быть NON_COMPLIANT (честный список долгов).
4. Break-glass: заведи MFA на своём IAM user, впиши его ARN в `break_glass_principal_arns`, `break_glass_enabled = true`, apply, один раз проверь вход (см. break-glass.md) и что оповещение пришло.
5. Athena: консоль Athena, workgroup `lawbid-...-security`, вкладка Saved queries. Нужны права на чтение бакета CloudTrail и `kms:Decrypt`.
6. Organization и SCP: только когда решишь (docs/runbooks/org-accounts.md).

## Что внутри

- `modules/aws-config`: рекордер, бакет доставки (шаблон бакета CloudTrail), 11 AWS managed rules: root MFA, нет root-ключей, S3 account Block Public Access, S3 public read/write запрещены, S3 SSE, RDS storage encrypted, CloudTrail включён, GuardDuty включён, нет inline-политик IAM, нет админ-политик в customer managed policies. NON_COMPLIANT идёт в alerts topic.
- `modules/break-glass`: роль, MFA <15 минут, сессия до 1 часа, оповещение в critical topic.
- `modules/org-guardrails`: 4 SCP (защита CloudTrail/Config/GuardDuty/Access Analyzer/Security Hub, региональный замок us-east-1/us-west-2 со списком глобальных сервисов AWS, запрет создания ключей доступа кроме break-glass, блокировка root).
- `modules/cloudtrail-athena`: Glue-таблица с partition projection (region, day), workgroup с лимитом скана 10 ГБ, запросы: кто удалил, входы в консоль, неудачная аутентификация и AccessDenied, изменения IAM, действия root.
- `modules/budget`: IMMEDIATE-подписка Cost Anomaly на SNS (к дневной почте).

## Риски

- Region-lock SCP: если приложение использует другой регион (например replica_region или backup_copy_region вне us-east-1/us-west-2), его надо добавить в `allowed_regions`.
- SCP может заблокировать Terraform: используй `exempt_principal_arns` и пробный OU.
- Config с daily-записью оценивает изменения раз в сутки, не мгновенно; для мгновенной реакции остаются EventBridge-правила из security-baseline.
- Список глобальных сервисов в region-lock взят по примеру AWS; сверь с актуальной страницей перед attach.
