# Свой пул соединений с базой (PgBouncer): включить, проверить, откатить

**Для владельца.** Зачем и как устроено: `docs/architecture/DB_POOLER.md`.
Коротко: между серверами и базой стоят 2 «диспетчера», база видит не больше 69
соединений из 99, сколько бы ни было серверов. Выключатель: строка
`db_pooler_enabled` в `terraform.tfvars`.

Эта инструкция только **описывает** шаги. В AWS ничего не применялось.

---

## 0. Когда включать

- **После** переключения базы в Multi-AZ (воскресенье), отдельным вечером:
  не меняем два больших узла за один раз.
- Сначала один нагрузочный тест с включённым пулом (в `loadtest` он включён
  по умолчанию), смотрим раздел 3 на его результатах. Только потом prod.
- Вне часов пик (выкладка пула идёт «по одному» диспетчеру).

## 1. Порядок шагов (prod)

0. **Только для нагрузочных тестов:** в `infra/bootstrap-loadtest` выполнить
   `terraform apply` (новые права на Cloud Map и частную зону, политика `dns`).
1. **Влить изменения** в `main` (код + Terraform + воркфлоу). Это даёт новый
   образ api; приложение без `DB_POOLER_HOST` работает как раньше.
2. **ECR-репозиторий.** В папке `infra/bootstrap` на вашем Mac:
   `terraform plan`, затем `terraform apply`. В плане должен появиться только
   `aws_ecr_repository.app["lawbid-pgbouncer"]` и его правило очистки.
3. **Собрать образ.** GitHub -> Actions -> **Build PgBouncer** -> Run workflow
   (тег по умолчанию `1.24.0-1`). Внизу страницы запуска: строка вида
   `pgbouncer_image = "...lawbid-pgbouncer:1.24.0-1"` и доказательство, что
   есть `linux/arm64` и `linux/amd64`.
4. **tfvars для prod** (файл `infra/envs/prod/terraform.tfvars`), добавить:

   ```
   db_pooler_enabled   = true
   pgbouncer_image     = "047754151252.dkr.ecr.us-east-1.amazonaws.com/lawbid-pgbouncer:1.24.0-1"
   pgbouncer_max_tasks = 3
   ```

5. **Посмотреть план:** `terraform plan`. Ожидается: проверка
   `db_connection_budget` проходит (без предупреждений); создаются пространство имён Cloud Map
   `lawbid-prod.internal` (и частная зона Route 53), сервис Cloud Map, security group пула,
   правила SG, ECS-сервис и задача
   `pgbouncer`, роли, лог-группа, 5 тревог, автомасштабирование; меняются
   определения задач api и worker (добавлены `DB_POOLER_HOST`, `DB_POOLER_PORT`,
   `DB_POOL_SIZE=10`); у базы появляется одно правило входа. **Ничего не
   удаляется.** Если плана иначе, не применять.
6. **Сначала только пул** (безопасный порядок, приложение пока не трогаем):

   ```
   terraform apply -target='module.stack.module.pgbouncer'
   ```

   Подождать 3-5 минут. Проверить раздел 2, пункты 1-3.
7. **Потом всё остальное:** `terraform apply`. Серверы api и worker
   перезапустятся по очереди (rolling) уже с `DB_POOLER_HOST`.
8. Проверка (раздел 2), 30 минут наблюдения, потом ночь без вмешательства.

Для нагрузочного теста ничего вручную: воркфлоу `load-test.yml` сам проверяет
образ `lawbid-pgbouncer:1.24.0-1` в ECR (поэтому шаги 2-3 нужны и для теста),
поднимает пул первым и ждёт его.

## 2. Как проверить, что работает

1. **ECS:** кластер `lawbid-prod` -> сервис `pgbouncer`: 2 из 2 задач Running.
2. **Имя пула:** AWS Cloud Map -> Namespaces -> `lawbid-prod.internal` -> сервис
   `pgbouncer`: 2 экземпляра Healthy (два IP).
3. **Лог пула:** CloudWatch -> Log groups -> `/lawbid/lawbid-prod/pgbouncer`:
   строка `process up: PgBouncer 1.24.0` и раз в 30 секунд JSON с
   `ClientsActive`, `ServerConnections`.
4. **Главная проверка (после шага 7).** RDS -> база -> Monitoring ->
   `DatabaseConnections`: должно стать **не больше ~69** и ровнее, чем раньше.
   CloudWatch -> Metrics -> `LawBid/lawbid-prod/PgBouncer`:
   `ServerConnections` (max на одну задачу <= 23), `ClientsWaiting` около 0,
   `MaxWaitSeconds` около 0.
5. **Приложение:** `/health/ready` отвечает 200; в админке «Здоровье системы»
   зелёное; пробный вход пользователя.
6. В логах api нет ошибок вида `prepared statement ... does not exist`,
   `query_wait_timeout`, `P1017`.

## 3. Что смотреть на нагрузочном тесте

- `ServerConnections` не превышает 69 в сумме при пике задач.
- `ClientsWaiting` и `MaxWaitSeconds` на пике: если регулярно > 0, пул мал
  (поднять размер базы или `pgbouncer_max_tasks`, см. архитектуру).
- CPU сервиса `pgbouncer` на пике. Больше 50 % постоянно: в
  `terraform.tfvars` `pgbouncer_cpu = 1024` (оставьте `pgbouncer_memory = 1024`
  или `2048`).
- Ошибки подключения у api/worker в момент, когда пул пересоздаётся или
  масштабируется (на коротких отрезках по 10-30 с допустимы, это цена Cloud Map
  вместо балансировщика); если их много, вернуть NLB (см. архитектуру 2.1).
- Ошибки Prisma `P1017` / `prepared statement`: поставить
  `DB_POOLER_QUERY=pgbouncer=true` (переменная окружения api/worker, меняется в
  `modules/stack` -> `local.db_pooler_env`) и повторить.
- Проверка failover (в Multi-AZ): `aws rds reboot-db-instance
  --db-instance-identifier lawbid-prod-postgres --force-failover` в
  согласованное окно; ошибки только 1-2 минуты, потом сами проходят.

## 4. Откат

**Обычный (5-10 минут):**

1. В `terraform.tfvars`: `db_pooler_enabled = false`.
2. Поскольку проверка бюджета без пула упадёт (140 задач x 3 > 99), одновременно
   понизить потолок: `api_max_tasks = 10`, `worker_max_tasks = 4` (при db.t4g.micro
   и без пула это максимум, что вмещает база) **или** не откатывать пул, а
   чинить его.
3. `terraform plan`, затем `terraform apply`. Серверы вернутся на прямой
   `DATABASE_URL` (секрет не менялся), потом удалятся сервис пула и имя Cloud Map.

**Аварийный (без Terraform, 2 минуты):** AWS Console -> ECS -> сервис `api`
(и `worker`) -> Update service -> предыдущая ревизия задачи (та, где нет
`DB_POOLER_HOST`) -> Force new deployment.

Если «нет живых серверов пула» (тревога `pgbouncer-no-healthy`): сначала
аварийный откат, потом разбор по логу `/lawbid/lawbid-prod/pgbouncer`.

## 5. Тревоги и что делать

| Тревога | Значит | Что делать |
|---|---|---|
| `...-pgbouncer-waiting` | запросы стоят в очереди за соединением | нагрузка/медленная база; админка -> база на размер больше |
| `...-pgbouncer-max-wait` | самый старый запрос ждёт > 5 с | то же, смотреть медленные запросы |
| `...-pgbouncer-server-connections` | пул у предела | то же; не поднимать `max_tasks` без понимания, он делит бюджет базы |
| `...-pgbouncer-no-healthy` | от пула нет метрик 3 минуты, ни одной работающей задачи, приложение без базы | аварийный откат (раздел 4) |
| `...-pgbouncer-unhealthy` | работает меньше задач, чем нужно (одна из двух), 10 минут | подождать: ECS пересоздаст; если повторяется, смотреть лог |

## 6. Стоимость

Около **32 $/мес** (2 диспетчера ARM64 ~29, имя в Cloud Map ~0.5, метрики и тревоги
~2); +14 $ на время, пока работает третий. (С внутренним балансировщиком было бы 49.) После отката
расходы прекращаются. Выключенный по умолчанию пул (`db_pooler_enabled = false`)
не стоит ничего.

## 7. Что остаётся прямым (мимо пула) и почему

`MIGRATOR_DATABASE_URL` (миграции), `RETENTION_DATABASE_URL` (очистка по срокам
хранения), `DEMO_DATABASE_URL` (демо-мир, CREATE DATABASE). Им нельзя
transaction-режим. Под них зарезервировано 30 соединений из 99.
