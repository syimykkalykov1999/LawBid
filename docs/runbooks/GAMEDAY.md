# GameDay: ломаем нагрузочный стенд нарочно (AWS FIS)

Только **стенд нагрузочного теста** (`lawbid-loadtest-*`). Боевой (prod) и staging
не затрагиваются: модуль отказывается работать с именем не `lawbid-loadtest*`, а в
правах роли есть явный запрет на всё с тегом `Project=lawbid`.

## Что ломаем

| Вход `gameday` | Что делает FIS | Что должно быть |
|---|---|---|
| `ecs` | `aws:ecs:stop-task` — останавливает 50 % задач API | ECS запускает новые, ALB выводит старые, ошибок почти нет |
| `redis` | `aws:elasticache:replicationgroup-interrupt-az-power` на 3 мин | реплика становится главной, сокеты переподключаются |
| `rds` | `aws:rds:reboot-db-instances` с `forceFailover=true` | переключение на резервную копию в другой зоне за ~1-2 мин |
| `all` | все три по очереди (только профиль `m1`) | |

Для `rds` стенд делается **Multi-AZ** (иначе переключаться некуда). Это примерно
вдвое дороже базу на время теста; сводка оценки цены добавляет +30 %.

## Предохранители

- Два аварийных сигнала (CloudWatch) остановят опыт сами: «нет ни одной живой
  задачи API» (2 минуты) и «больше половины запросов с ошибкой 5xx» (3 минуты).
  FIS при срабатывании сразу прекращает опыт и откатывает действие.
- Общая защита нагрузки (ошибок > 5 % или p95 > 2 с за 60 с) остаётся как была.
- Профили только `smoke` и `m1` (на `smoke` — один опыт за раз).
- Всё с тегом `Project=lawbid-loadtest`; стенд уничтожается как обычно.

## Один раз (делает владелец)

Роль нагрузочных тестов должна получить права на FIS (файл
`infra/bootstrap-loadtest/main.tf`, новый блок «6. GameDay»). С Mac:

```sh
cd infra/bootstrap-loadtest
terraform init
terraform plan -out=fis.plan
terraform apply fis.plan
```

В плане должны быть: новая политика `lawbid-loadtest-fis`, изменение
`lawbid-loadtest-deny` и два новых присоединения политик. Больше ничего.

## Запуск

GitHub → Actions → **Load test** → Run workflow: профиль `smoke` (дёшево, для
проверки, `gameday = ecs`) или `m1`, поле `gameday`, `confirm_cost` как обычно.
Опыты стартуют на плато нагрузки (smoke: через 90 с; m1: через 15 мин), между
опытами пауза (90 с / 5 мин).

Скрипт `loadtest/scripts/gameday.sh` каждые 2 секунды стучится в
`/health/live` через балансировщик и считает самый долгий провал.

## Результат

В сводке запуска и в отчёте (раздел **GameDay**): для каждого опыта статус FIS
(`completed` или `stopped` = сработал аварийный сигнал), время начала/конца,
самое долгое время недоступности, вернулся ли API в норму за 5 минут. Красная
аннотация `GameDay` — API не вернулся. Рядом таблицы gate-проверок и CloudWatch
(CPU БД, подключения, ошибки): по времени видно, что именно просело.

Журнал прогонов (заполнять после каждого):

| Дата | Профиль | Опыт | Недоступность | Ошибки k6 в окне | Вывод |
|---|---|---|---|---|---|
| — | — | — | — | — | ещё не запускали |

## Исследование (2026-10-24, документация AWS)

- Действия FIS: `aws:ecs:stop-task`, `aws:rds:reboot-db-instances` (параметр
  `forceFailover`), `aws:elasticache:replicationgroup-interrupt-az-power` (нужен
  Multi-AZ, Redis и Valkey, не serverless). Разрешения — как в модуле
  `infra/modules/fis-gameday` (роль `lawbid-loadtest-fis`).
- Fargate: CPU stress, I/O stress и сетевая задержка / потеря пакетов /
  blackhole поддерживаются на Fargate (сетевые — с декабря 2024). Но требуют в
  определении задачи: контейнер-спутник SSM-агента, `pidMode = task`,
  `enableFaultInjection = true`, роль задачи с `ssm:CreateActivation`,
  `ssm:AddTagsToResource`, `iam:PassRole`, у сетевых действий параметр
  `useEcsFaultInjectionEndpoints = true`; ECS Exec должен быть выключен.
  Источники: docs.aws.amazon.com/fis/latest/userguide/ecs-task-actions.html,
  aws.amazon.com/about-aws/whats-new/2024/12/amazon-ecs-network-fault-injection-experiments-fargate.

## Позже (не сделано специально)

CPU/латентность на задачах: это правка общего модуля ECS (спутник и `pidMode`
меняют **боевые** определения задач, и спутник ставит пакеты через `dnf` при
старте). Правильный путь: переменная `fault_injection_enabled` (по умолчанию
выключена, включается только в loadtest), затем новые шаблоны
`task-cpu-stress` и `task-network-latency`. Отдельная задача, не смешивать с
этой.
