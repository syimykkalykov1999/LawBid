---
id: error-budget-policy
title: Запас ошибок: стоп новых функций, когда сервис часто падает
category: system
cost: Одна маленькая функция Lambda раз в час и несколько тревог CloudWatch, меньше $1 в месяц
time: 10 минут (один terraform apply), обход — 1 минута
runbook: error-budget-policy.md
verified: 2026-11-25
sources:
  - Google SRE Workbook: Example Error Budget Policy | https://sre.google/workbook/error-budget-policy/
  - Google SRE Workbook: Implementing SLOs | https://sre.google/workbook/implementing-slos/
  - Amazon CloudWatch: тревоги | https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html
---

## Что это и зачем

У каждого важного действия (вход, лента, чат, оплата) есть цель надёжности, например 99,9 % запросов без ошибки. Разница до 100 % — это «запас ошибок» на четыре недели. Так делает Google: пока запас есть, новые функции выходят как обычно. Когда запас за 28 дней кончился, сервер выпускает только исправления (`fix:`, `revert:`, `security:`), пока надёжность не вернётся. Решение принято заранее, поэтому во время аварии спорить не о чем.

Проверку делает шаг «Error budget gate» в выкатке прода. Если запас кончился и в выкате есть новая функция, выкат останавливается и в отчёте написано почему. Откат на старую версию не останавливается никогда.

## Что понадобится

- Доступ к AWS для `terraform apply`.
- Доступ к настройкам репозитория GitHub (только для обхода).

## Шаги

1. Примените Terraform прода: `cd infra/envs/prod` → `terraform plan` (ожидаются функция `error-budget`, её расписание и тревоги `*-budget-exhausted`) → `terraform apply`. До apply проверка выката ничего не останавливает.
## Как проверить

1. Через час после apply в CloudWatch → Alarms есть тревоги `lawbid-prod-slo-…-budget-exhausted` в состоянии OK.
2. В отчёте следующего выката прода (GitHub → Actions → Deploy) шаг «Error budget gate» зелёный и пишет «every SLO has error budget left over 28 days, release allowed».

## Обход (только когда виноваты не мы)

Если запас съел общий сбой AWS, Twilio, Stripe или Cloudflare, нагрузочный тест или ошибочный подсчёт, функции можно выпускать дальше:

1. GitHub → Settings → Secrets and variables → Actions → Variables → `BUDGET_GATE` = `warn` (только пишет в отчёт) или `off`.
2. Запишите в журнал в `docs/runbooks/error-budget-policy.md`: дата, какой SLO, почему, до когда.
3. Когда запас вернулся, удалите переменную (по умолчанию `on`).

Выключить всё целиком: `error_budget_enabled = false` в terraform прода и apply.
