# Пакет A: что включить в проде и как (2026-10-24)

> **Для владельца:** код готов и **ничего в AWS не применено**. Все
> переключатели ниже безопасны по отдельности. Порядок работы всегда один:
> строка в секрет `lawbid-prod/terraform-tfvars` → `terraform plan` через
> `scripts/deploy/plan-guard.sh` → прочитать план → «ставь на AWS». Источник
> решений: `docs/architecture/P0_AND_COST_PLAN.md` (ветка
> `claude/benchmark-doc`), цены перепроверены 2026-10-24 на страницах AWS.

## 0. Одним куском: строки для prod tfvars

Добавить в секрет `lawbid-prod/terraform-tfvars`. Строки с пометкой
«позже» не включать сейчас.

```hcl
# 1. Звонок на телефон (после регистрации в PagerDuty, docs/runbooks/paging.md)
pagerduty_https_endpoint = "https://events.pagerduty.com/integration/REPLACE/enqueue"

# 2. Тревога «нет копии за сутки» не ложная до первой копии:
#    ПЕРЕД первым apply поставить notBreaching, через день после первой готовой
#    копии вернуть breaching (или удалить строку).
backup_age_missing_data = "notBreaching"

# 3. Безопасность
backup_vault_lock_mode             = "governance" # compliance только после зачтённого учебного восстановления
backup_vault_lock_cooling_off_days = 7            # действует только для compliance
audit_logs_enabled                 = true         # ≈ $2-12/мес
audit_logs_object_lock             = false        # НЕ включать: см. 3.2
documents_data_events              = true         # ≈ $0,10 за 100 000 событий
waf_bot_control_enabled            = true         # режим «считать»: ≈ $10/мес + см. 3.3
waf_bot_control_block              = false        # блок только через 1-2 недели данных
# guardduty_runtime_monitoring = true   # позже, 3.4
# guardduty_ebs_malware        = true   # не нужно (мы на Fargate)

# 8. Бюджет и всплески расходов
monthly_budget_usd           = 350    # или своя реальная граница, см. 4
budget_forecast_thresholds   = [80, 100]
budget_to_alerts_topic       = true
create_anomaly_monitor       = false  # монитор AWS уже есть (Default-Services-Monitor)
anomaly_existing_monitor_arn = "arn:aws:ce::047754151252:anomalymonitor/22314789-2e8e-43a5-8360-f93611944718"
anomaly_extra_emails         = ["REPLACE@gmail.com"]
anomaly_threshold_usd        = 20

# 9. Память Redis: тревога на 70 % уже по умолчанию (redis_memory_alarm_percent = 70)

# 15. NAT: тревога на 100 ГБ/сутки по умолчанию (nat_traffic_alarm_gb_per_day = 100)

# 12. Worker на Spot — уже true в launch.tfvars.example (api_spot тоже).
#     ARM64 — позже, 6.2:
# cpu_architecture = "ARM64"
```

Если в секрете уже есть строка с тем же именем (например `worker_spot`,
`create_anomaly_monitor`), менять её, а не дублировать.

## 1. Телефон: PagerDuty

Только критические составные тревоги (SMS-коды, звонки, пуши). Подробно и по
шагам: `docs/runbooks/paging.md`. Владелец сам регистрируется в PagerDuty
(агент не может), кладёт ссылку интеграции в секрет и проверяет тестовым
сообщением.

## 2. Учебное восстановление и «падение» базы

Подробно: `docs/runbooks/restore-drill.md`. Кратко: **сегодня вручную
запустить копию** (команда там же), во вторник-понедельник вне пика —
`MODE=backup-vault` (восстановление из хранилища AWS Backup), затем в
staging/loadtest тест `FAILOVER=1`, потом (с вашего «да») в проде.

## 3. Безопасность: что включено и почему именно так

1. **Хранилище копий с замком (Vault Lock), режим `governance`**: роль
   резервного копирования не может удалить копию раньше срока; админ с
   особым правом ещё может (это страховка от ошибки). **`compliance`**
   необратим через 7 дней (даже root не снимет): включать только после
   того, как `MODE=backup-vault` прошёл и записан в журнал. В сайте
   честная формулировка «копии в двух регионах» (не «защита от удаления»)
   до compliance.
2. **Журнальный бакет (`audit_logs_enabled = true`)** хранит журнал ALB,
   журнал доступа к документам и сетевые логи VPC. **Object Lock там не
   включаем:** по документации AWS бакет с Object Lock не может
   принимать журналы доступа S3
   ([Enabling S3 server access logging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enable-server-access-logging.html),
   проверено 2026-10-24: «buckets with S3 Object Lock enabled can't be
   used as destination buckets»). Это отступление от плана: бакет и так
   без права удаления через IAM, с версиями и lifecycle 400 дней; Object
   Lock необратим для бакета, поэтому лучше без него.
3. **WAF Bot Control, только «считать»** (`waf_bot_control_enabled = true`,
   `waf_bot_control_block = false`): правило `bot-control` на ALB в режиме
   Count, ничего не блокирует, метки видны в метриках WAF. Цена
   ([AWS WAF pricing](https://aws.amazon.com/waf/pricing/), 2026-10-24):
   **Common: $10 в месяц за ACL + $1 за миллион запросов, первые 10 млн в
   месяц бесплатно**; Targeted был бы $10 за млн (мы берём Common). Плюс
   правило $1/мес. На нашем масштабе это ≈ $11/мес. Блок включать через
   1-2 недели, посмотрев метрики `lawbid-prod-bot-control`.
4. **GuardDuty-добавки.** Уже включены: CloudTrail, DNS, flow logs, S3
   data events, RDS login, Lambda network. Новые флаги **выключены**:
   - `guardduty_runtime_monitoring` — Fargate Runtime Monitoring,
     **$1,50 за vCPU в месяц** ([GuardDuty pricing](https://aws.amazon.com/guardduty/pricing/),
     2026-10-24): 3-30 задач по 0,5-1 vCPU ≈ $5-50/мес, плюс добавляется
     контейнер-агент к каждой задаче (меняет запуск). Не дёшево и не
     «просто»: после релиза и сначала в staging.
   - `guardduty_ebs_malware` — $0,03/ГБ только при находке; у нас Fargate
     и ClamAV, польза нулевая.
5. Откат любого флага: поставить `false` / `"off"`, apply. Исключения:
   Vault Lock `compliance` и бакет с Object Lock необратимы.
6. Сегодня **не** включать (по плану, после релиза): Security Hub
   (≈ $5-15), Inspector, Macie.

## 4. Бюджеты и всплески расходов

- Сейчас в AWS два бюджета: `LawBid Monthly` = $50 (создан руками, **его
  надо удалить руками**, он шлёт лишние письма) и `lawbid-prod-monthly` =
  $200 (Terraform). В коде по умолчанию $350.
- **Какой бюджет читает «охранник расходов»:** воркер раз в час читает
  бюджет с именем из `OPS_BUDGET_NAME` = `lawbid-prod-monthly`, то есть
  именно Terraform-бюджет (`ops-guard.job.ts`, `aws-ops.service.ts`). При
  100 % фактических расходов он ставит потолок автоскейла ECS на минимум до
  конца месяца. Значит: **сумма в `monthly_budget_usd` = граница, на
  которой приложение придушится**. Нужна реальная граница, поэтому
  владелец называет цифру; в примере 350 (≈ запуск $150-170 + Redis реплика
  + LiveKit + трафик + запас). Не ставить $50: в середине месяца
  автоскейл упрётся в минимум.
- Новое: письма **по прогнозу** на 80 % и 100 % (`budget_forecast_thresholds`,
  «месяц идёт к границе, а деньги ещё не потрачены») плюс копия в SNS-топик
  тревог (`budget_to_alerts_topic`). Цена: бюджеты и уведомления бесплатны
  (платные только бюджеты с автодействиями сверх двух;
  [AWS Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)).
- Всплески расходов: у AWS один сервисный монитор на аккаунт
  (`Default-Services-Monitor`), он уже есть, подписка по умолчанию — раз в
  день. Мы **добавляем вторую подписку на тот же монитор** с порогом
  $20 и вашей почтой: `create_anomaly_monitor = false`,
  `anomaly_existing_monitor_arn`, `anomaly_extra_emails` (строки в п. 0).
  Импорт не нужен.
- Руками один раз: удалить бюджет `LawBid Monthly` ($50) в консоли AWS Billing → Budgets.

## 5. Redis и NAT (только тревоги)

- Тревога памяти Redis теперь на **70 %** (было 80 %): `lawbid-prod-redis-memory`;
  что делать: `docs/runbooks/redis.md`.
- NAT: `lawbid-prod-nat-bytes-0`, письмо при > 100 ГБ/сутки; когда нужны
  эндпоинты: `docs/runbooks/nat-endpoints.md`.

## 6. Worker на Spot и ARM64 (подготовка, НЕ включать сейчас)

Spot: `worker_spot` и `api_spot` в `launch.tfvars.example` уже `true`; в
модуле ECS стоит `force_new_deployment = true`, поэтому смена стратегии —
скользящее обновление, а не замена сервиса.

1. **Проверка плана.** Только через `scripts/deploy/plan-guard.sh`: у
   `aws_ecs_service.worker` должно быть `update in-place`, **не** `must be
   replaced`. Иначе стоп, написать Claude.
2. Применить `worker_spot = true` (воркер читает очередь, задача повторяема,
   Spot предупреждает за 2 минуты). Сутки смотреть глубину очередей
   (админка → Здоровье системы). `api_spot` — позже и не раньше исправления
   бюджета подключений к БД.
3. **ARM64 (Graviton, ≈ −20 % за Fargate):**
   1. `.github/workflows/deploy.yml` уже собирает multi-arch (amd64+arm64).
      Сделать один деплой, затем проверить образы (только чтение):

      ```sh
      scripts/ops/arm64-check.sh lawbid-api:<тег> lawbid-admin:<тег> lawbid-pgbouncer:<тег> lawbid-clamav:1.4-debian
      ```

      Все четыре строки должны быть `OK [amd64,arm64]`.
   2. Зеркало ClamAV на Debian (в `clamav/clamav:1.4` только amd64):
      GitHub → Actions → **Mirror ClamAV** → Run workflow (по умолчанию
      копирует `clamav/clamav-debian:1.4` в ECR как `lawbid-clamav:1.4-debian`;
      повторный запуск безопасен, теги неизменяемы). Затем строка в tfvars:

      ```hcl
      clamav_image = "047754151252.dkr.ecr.us-east-1.amazonaws.com/lawbid-clamav:1.4-debian"
      ```

      Применить это **до** ARM64 и проверить сканер на x86.
   3. Сначала staging: `cpu_architecture = "ARM64"` → plan → apply →
      загрузка файла проходит антивирус. Потом prod: те же шаги, Fargate
      заменяет задачи по очереди. Откат: убрать строку, apply.
   4. Цены Spot (до −70 %) и ARM (≈ −20 %) — оценки сторонних источников
      и AWS, проверять в Cost Explorer после включения.

## Риски

- Тревога `…-db-backup-age` ложно звонит до первой копии: поэтому
  `backup_age_missing_data = "notBreaching"` на время, потом вернуть.
- Критические составные тревоги звонят на 100 звонков/мес: «мигание»
  сожжёт квоту (paging.md).
- `monthly_budget_usd` = граница, на которой система душит автоскейл.
- Vault Lock compliance и Object Lock необратимы: не раньше зачтённого
  учебного восстановления.
- Тест `FAILOVER=1` в проде даёт реальный простой около минуты.
