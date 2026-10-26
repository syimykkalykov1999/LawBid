# Расходы AWS (aws-budget-reached, AWS Budgets, Cost Anomaly)

**Для владельца.** Бюджет месяца задаётся числом `monthly_budget_usd`
(по умолчанию $350: реальный запуск с пустым приложением ≈ $270–285 в месяц, остальное запас на рост; на 100 % сервер держится на минимуме; каждая строка расхода с ценой, переключателем и тревогой: [COST_LADDER.md](COST_LADDER.md)). Письма приходят при 50 %, 80 % и 100 % фактических
расходов и когда прогноз месяца выше бюджета. На 100 % система сама
держит сервер на минимуме (одна копия API и одна фоновых задач — как при
запуске) до первого числа следующего месяца, потом возвращает обычный
режим. Приложение при этом работает; при большом наплыве людей может
замедлиться. Выключатель: админка → Система → Здоровье системы →
«Минимум сервера, когда бюджет AWS исчерпан».

**Signal.** `${env}-aws-budget-reached` (log metric `CostCeilingReached`
from the worker's `ops.cost-check`), AWS Budgets e-mails, Cost Anomaly
Detection daily e-mail.

**Check.** Billing → Cost Explorer → group by Service: what grew? Usual
suspects: NAT data (large uploads through the API instead of presigned
S3), CloudWatch Logs ingestion (debug logging left on), ECS tasks stuck at
`*_max_tasks` (traffic or an abusive client — WAF), CloudFront (media).

**Act.**
- Organic growth → raise `monthly_budget_usd` in `terraform.tfvars`, apply.
- Abuse → lower `waf_rate_limit_per_5m`; check `sms-spend` too.
- Need capacity now → admin «Обычный режим» (the cap is lifted until the
  next hourly check finds the month still over budget and the auto switch
  on; turn the switch off for the rest of the month if needed).

**After.** Terraform re-applies the normal autoscaling ceiling on the next
`terraform apply`; the worker re-caps within an hour if still over budget.

## Лимиты по умолчанию на SMS и письма (SES)

Живые значения лежат в админке (`budget.<провайдер>.per_minute_max|daily_max|monthly_max`);
числа ниже — запасные, из переменных окружения.

| Что | в минуту | в день | в месяц | Почему |
| --- | --- | --- | --- | --- |
| SMS (`BUDGET_SMS_*`) | 30 | 300 | 9 000 | 300 × 30 дней; цена США 1 150 милли-центов ($0,0115) → ≈ $104 в месяц на США, дальние страны дороже и режутся денежным лимитом `BUDGET_SMS_DAILY_CENTS` |
| Письма SES (`BUDGET_EMAIL_*`) | 100 | 2 000 | 60 000 | 2 000 × 30 дней; SES ≈ $0,10 за 1 000 → ≈ $6 |

Цена SMS в `cost-prices.ts`: США/Канада 1 150 милли-центов (было 830 —
занижена, бюджет считался с недооценкой). Если реальный счёт Twilio
расходится больше чем на 20 % — править таблицу и этот файл вместе.

## Теги затрат: включить в консоли (делает владелец, один раз)

Что уже в коде (2026-10-24): все ресурсы Terraform получают теги через
`default_tags` провайдера: `Project` (`lawbid`; у нагрузочного стенда
`lawbid-loadtest`), `Env` (`prod` / `staging` / `loadtest`), `ManagedBy`.
Задачи Fargate наследуют теги сервиса (`propagate_tags = SERVICE`), а сервисы
`api`, `worker`, `admin`, `pgbouncer` теперь ещё несут тег `Component` — так в
счёте видно, сколько стоит каждая часть. Это изменение тегов «на месте»,
без пересоздания.

Теги в счёте появляются только после активации (по умолчанию выключены):

1. Войти под **управляющим** аккаунтом (management account).
2. AWS Billing and Cost Management → **Cost allocation tags** → вкладка
   **User-defined cost allocation tags**.
3. Отметить `Project`, `Env`, `Component`, `ManagedBy` (появляются в списке
   в течение суток после первого ресурса с тегом) → **Activate**.
4. Данные в Cost Explorer появляются примерно через 24 часа. Чтобы подтянуть
   прошлое: на той же странице **Backfill tags** → выбрать месяц (назад до 12
   месяцев; раз в 24 часа; считаются только периоды, когда тег уже стоял на
   ресурсе).
5. Cost Explorer → Group by → Tag → `Component` или `Env`.

Хранилище S3: медиа и документы уже переходят в Intelligent-Tiering (правило
`intelligent-tiering` в `infra/modules/s3/main.tf`, файлы от 128 КБ), добавлять
нечего.

Источник: docs.aws.amazon.com/awsaccountbilling (Backfill cost allocation
tags), проверено 2026-10-24.

## Админка: «Запуск», «Масштаб» (бюджеты), «Расходы» (с 2026-10-25)

- **Система → Запуск**: список ваших шагов перед запуском, у каждого
  зелёный/жёлтый/красный свет, который сервер определяет сам (только чтение,
  кэш 5 минут). То, что определить нельзя, отмечается галочкой.
  Учебное восстановление базы отмечается кнопкой после
  `scripts/ops/restore-drill.sh`; свет красный, если прошло больше 90 дней.
- **Система → Масштаб → Бюджеты AWS**: все бюджеты аккаунта (потолок,
  потрачено, прогноз). «Изменить потолок» у боевого `lawbid-prod-monthly` и
  «Удалить» у старого «LawBid Monthly» ($50) работают с кодом 2FA; второй
  админ нужен, только если включено `admin.dual_control`. Terraform потолок
  больше не перезаписывает (`ignore_changes = [limit_amount]`).
- **Система → Расходы**: деньги по сервисам (AWS по сервисам с учётом
  кредитов, Twilio, Bunny, Cloudflare звонки и R2, комиссия Stripe) и
  постоянные платежи, которые вы вписываете сами. Итог «сколько держать на
  счету» = прогноз счетов + 20 % (комиссия Stripe сюда не входит: Stripe
  удерживает её сам). Данные берёт ежедневная задача `ops.usage-poll`
  (06:25 UTC); Cost Explorer стоит $0.01 за запрос, поэтому AWS читается не
  чаще раза в 6 часов (кнопка «Обновить» это правило не обходит). Цены
  Cloudflare лежат в блоке «Цены» с источником и датой проверки; поменялась
  цена на их сайте, поправьте число.
- Права AWS для всего этого (SNS на топик critical, Budgets, Cost Explorer
  только чтение) добавлены в Terraform: владелец применяет один раз, см.
  `docs/runbooks/paging.md`, раздел «Права AWS».
