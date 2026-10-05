# Расходы AWS (aws-budget-reached, AWS Budgets, Cost Anomaly)

**Для владельца.** Бюджет месяца задаётся числом `monthly_budget_usd`
(запуск: $200). Письма приходят при 50 %, 80 % и 100 % фактических
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
