# Прогноз нагрузки API и «сначала копия для чтения» (пункты 27–28, AU1 и AU4)

owner: да (Terraform apply и права — шаги владельца)

Решение владельца 25.11: сделать «Авто» так же, как у больших платформ, лимиты — в админку. Обычное «Авто» (рост по процессору, запросам, сокетам, очереди; ночью меньше) осталось как было, новое добавлено рядом.

## 27. Прогноз нагрузки API (AWS ECS predictive scaling)

Как у Netflix (Scryer, SREcon25) и по руководству AWS («Use historical patterns to scale Amazon ECS services with predictive scaling», доступно с 21.11.2024): по прошлым двум неделям AWS строит почасовой прогноз запросов на 48 часов вперёд и может добавить серверы API **до** часа пик. Прогноз сам серверы не убирает; уменьшает только обычное «Авто». Из нескольких политик выигрывает та, что хочет больше серверов. Потолок `scale.max_tasks.api` не превышается (HonorMaxCapacity).

- Terraform создаёт политику `lawbid-prod-api-predictive` в режиме **ForecastOnly** (только прогноз, серверы не трогает, бесплатно). Сигнал тот же, что у обычного «Авто» по запросам: запросы ALB на один здоровый сервер, обе целевые группы при встроенном canary.
- Админка → Настройки `infra.predictive_scaling_mode`:
  - `forecast` — это «Выкл»: только прогноз;
  - `on` — прогноз добавляет серверы заранее;
  - `auto` (по умолчанию) — раз в `infra.predictive_check_minutes` (60) минут сервер сравнивает прогноз с настоящими запросами (ошибка за сутки = сумма |прогноз − факт| / сумма факта). Если `infra.predictive_good_days` (14) дней подряд ошибка не больше `infra.predictive_max_error_pct` (20 %), политика сама переходит в ForecastAndScale. После плохого дня или дня без замера — снова только прогноз.
- Цель прогноза — та же, что у «Авто» по запросам: «Масштаб» → `api_requests.target` (запросов на сервер в минуту). Меняете её в админке — прогноз получает то же число сразу при сохранении (`AwsOpsService.syncPredictiveTarget`), Terraform его не возвращает.
- Что сейчас: «Расходы → Реестр», строка «Прогноз нагрузки API» — режим и ошибка за последний день.

## Запросы с обеих целевых групп (встроенный canary, PR #1296)

С `api_native_deploy` = `prepare` / `canary` / `linear` политика `lawbid-prod-api-requests` считает (запросы `api` + `api-green`) / (здоровые серверы `api` + `api-green`) в минуту — это определение AWS для `ALBRequestCountPerTarget`, только по двум группам. С `off` — прежняя политика. Цель и паузы по-прежнему меняются в админке («Масштаб»).

## 28. Сначала копия для чтения, потом размер базы

Как Instagram и OpenAI (январь 2026) и по руководству AWS RDS («Working with DB instance read replicas»): чтение растёт копиями, главную базу увеличивают ради записи. Копии для чтения, их «Авто» (`infra.mode.rds_replicas`, `_2`…`_5`), отправка чтения на копию и защита от отставания (`db.replica_reads`, `db.replica_max_lag_ms`) уже были; не хватало порядка: Lambda размера базы увеличивала главную базу через 15 минут, раньше, чем копия успевала появиться.

- Админка → Настройки `scale.db_replica_first.mode`:
  - `off` — как раньше, база растёт сразу;
  - `on` — когда база занята только по процессору, Lambda ждёт копию до `scale.db_replica_first.wait_minutes` (60) минут, пока копий меньше `scale.db_replica_first.max_replicas` (5);
  - `auto` (по умолчанию) — так же, но только если копия правда может появиться (копии, чтение с копии и облачное «Авто» не выключены).
- Не ждёт никогда: нехватка памяти, соединений и «быстрая полоса» (процессор > 90 % 10 минут) — копия их не снимает.
- Пока Lambda ждёт, вам приходит письмо «Сначала разгружаем чтение копией базы…». Если через срок нагрузка осталась — база растёт как раньше, копии догоняют её размер.

## Шаги владельца

1. `cd infra/envs/prod` → `terraform plan`. Ожидается: новая политика `aws_appautoscaling_policy.api_predictive` (ForecastOnly), у `api_requests` без изменений (если `api_native_deploy` = off), новые права в политиках задач (`application-autoscaling:GetPredictiveScalingForecast`, `cloudwatch:GetMetricData`), у Lambda `lawbid-prod-db-autoscale` новые переменные `CONTROLS_BUCKET` / `CONTROLS_KEY` и право `s3:GetObject` на `ops/scale-controls.json`. Ничего не удаляется. `terraform apply`. Сразу записать переменные в секрет `lawbid-prod/terraform-tfvars` (KNOWN_ERRORS 87).
2. Код Lambda базы обновится тем же apply (или «Авто» `aws.autoscale_code`).
3. Через сутки после apply AWS начнёт прогноз; «Авто» включит его не раньше чем через 14 точных дней.

## Как проверить

- AWS Console → ECS → `lawbid-prod` → `api` → Service auto scaling: есть `lawbid-prod-api-predictive`, Mode = Forecast only; через сутки Actions → Predictive scaling → View graph показывает прогноз.
- «Расходы → Реестр» → «Прогноз нагрузки API»: строка с ошибкой прогноза.
- Lambda базы: CloudWatch Logs `/aws/lambda/lawbid-prod-db-autoscale` → строки `"event": "decision"` с полем `"replica_first": "auto"`.
- Живая проверка «копия сначала» (по правилу 17.11 — коротко и вернуть): временно `economy.db_cpu_limit_percent` и `up_cpu_pct` ниже текущей нагрузки → письмо «Сначала разгружаем чтение копией базы» → вернуть значения.
