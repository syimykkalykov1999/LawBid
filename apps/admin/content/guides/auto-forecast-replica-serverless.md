---
id: auto-forecast-replica-serverless
title: «Авто» как у больших платформ: прогноз серверов, копия базы сначала, Valkey Serverless
category: system
runbook: predictive-and-read-first.md, valkey-serverless.md
cost: Прогноз и сравнение цены бесплатны. Прогноз добавляет серверы API только в пределах потолка. Serverless Valkey — только если вы перейдёте по инструкции.
time: 15 минут на Terraform apply; переход на Serverless — около 30 минут ночью
verified: 2026-11-25
sources:
  - AWS ECS: predictive scaling | https://docs.aws.amazon.com/AmazonECS/latest/developerguide/predictive-auto-scaling.html
  - AWS ECS: оценка прогноза | https://docs.aws.amazon.com/AmazonECS/latest/developerguide/predictive-scaling-graphs.html
  - AWS RDS: копии для чтения | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html
  - AWS ElastiCache: цены | https://aws.amazon.com/elasticache/pricing/
  - AWS ElastiCache: восстановление копии в новый кэш | https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/backups-restoring.html
---

## Что это и зачем

Три улучшения «Авто» по образцу Netflix, Instagram и AWS. Обычное «Авто» осталось как было.

1. **Прогноз серверов API.** AWS по прошлым неделям видит, когда у нас пик, и может добавить серверы заранее. Сначала только прогноз; когда он 14 дней подряд точный (ошибка не больше 20 %), «Авто» само разрешает ему добавлять серверы. Потолок серверов не превышается.
2. **Сначала копия базы для чтения, потом рост базы.** Когда база занята по процессору, сначала появляется копия для чтения (до 60 минут ожидания), и только если это не помогло — главная база становится больше.
3. **Valkey Serverless.** «Авто» считает, что дешевле при нашей нагрузке: обычные узлы или Serverless, и пишет ответ в «Расходы → Реестр». Сам не переключает.

## Что понадобится

- Доступ к AWS для `terraform apply`.
- Админка с правом владельца.

## Шаги

1. `cd infra/envs/prod` → `terraform plan` → проверить, что ничего не удаляется (новая политика прогноза, новые права, у Lambda базы две новые переменные) → `terraform apply`. Подробно: `docs/runbooks/predictive-and-read-first.md`.
2. Записать те же переменные в секрет `lawbid-prod/terraform-tfvars`.
3. Админка → Настройки: `infra.predictive_scaling_mode` = auto, `scale.db_replica_first.mode` = auto, `infra.valkey_serverless_mode` = auto (это значения по умолчанию, менять не нужно).
4. Переход на Serverless — только если в «Расходы → Реестр» написано «пора переходить»: `docs/runbooks/valkey-serverless.md`.

## Как проверить

- AWS Console → ECS → `lawbid-prod` → `api` → Service auto scaling: есть `lawbid-prod-api-predictive` (Forecast only).
- «Расходы → Реестр»: строки «Прогноз нагрузки API» и «Valkey Serverless (сравнение цены)» показывают замеры (первые — через сутки).
- Письмо «Сначала разгружаем чтение копией базы…» приходит, когда база занята по процессору.
