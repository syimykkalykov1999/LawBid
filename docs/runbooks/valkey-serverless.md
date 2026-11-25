# Valkey: узлы или ElastiCache Serverless (пункт 29, AU5)

owner: да (Terraform apply — шаги владельца)

Решение владельца 25.11: изучить, как делают большие платформы, выбрать лучшее, лимиты — в админку. Здесь: что сравнивается, сколько стоит, и как перейти на Serverless без потери данных, если «Авто» скажет, что так дешевле.

## Что работает само

- Админка → Настройки `infra.valkey_serverless_mode` = **auto** (по умолчанию). Раз в `infra.valkey_serverless_check_hours` часов (6) сервер берёт настоящую нагрузку нашего Valkey за `infra.valkey_serverless_days` дней (7): данные в памяти (`BytesUsedForCache`), команды (`KeyBasedCmds` + `NonKeyTypeCmds`), трафик (`NetworkBytesIn/Out`) и считает цену на узлах и на Serverless (`apps/api/src/common/ops/valkey-serverless.logic.ts`).
- Ответ виден в «Расходы → Реестр», строка «Valkey Serverless (сравнение цены)». «Пора переходить» появляется, только если Serverless дешевле на `infra.valkey_serverless_min_saving_pct` % (10) **каждый** день окна.
- Сам Valkey «Авто» не переключает никогда (KNOWN_ERRORS 144: «Авто» не трогает то, через что идут живые запросы). Переход — шаги ниже.

## Цены (AWS ElastiCache pricing, us-east-1, проверено 25.11.2026)

Источник: https://aws.amazon.com/elasticache/pricing/

- Serverless Valkey: $0,084 за ГБ в час хранения (не меньше 100 МБ на кэш), $0,0023 за миллион ECPU. 1 ECPU ≈ простая команда до 1 КБ; скрипты (очереди BullMQ) дороже — поэтому в расчёте множитель `infra.valkey_serverless_ecpu_factor` = 1,5.
- Узлы Valkey (на 20 % дешевле Redis OSS): t4g.micro $0,0128/ч, t4g.small $0,0256/ч, t4g.medium $0,052/ч, r7g.large $0,1752/ч, r7g.xlarge $0,3496/ч.
- Valkey 9.0 есть и для Serverless (AWS, 05.05.2026); 9.1 — только для узлов (23.06.2026).

## Сколько стоит (расчёт, месяц = 730 ч)

| Нагрузка | Данные | Команд/с | Узлы сейчас | Serverless |
|---|---|---|---|---|
| Сейчас (оценка) | ≈ 0,08 ГБ | ≈ 30 | 1 × t4g.micro ≈ $9,34 (без запасного узла) | ≈ $6,13 хранение + $0,27 ECPU ≈ $6,40 (Multi-AZ включён) |
| 10× | ≈ 2 ГБ | ≈ 300 | 2 × t4g.medium ≈ $75,92 | ≈ $122,64 + $2,72 ≈ $125,36 |
| 100× | ≈ 20 ГБ | ≈ 3 000 | 2 × r7g.xlarge ≈ $510,42 | ≈ $1 226,40 + $27,20 ≈ $1 253,60 |

Вывод: при очень маленьких данных Serverless дешевле (и сразу с запасной копией), при росте данных — узлы в 1,6–2,5 раза дешевле: хранение в Serverless стоит ≈ $61 за ГБ в месяц, а у узла r7g.xlarge ≈ $10 за ГБ. Цифры «сейчас» — оценка; настоящие считает «Авто» по CloudWatch.

## Переключатели

- Админка: `infra.valkey_serverless_mode` (off / auto), числа выше.
- Terraform (`infra/envs/prod`): `redis_serverless_mode` = `off` (сегодня) | `standby` | `on`; потолки `redis_serverless_max_data_gb` (10) и `redis_serverless_max_ecpu_per_second` (100 000) — счёт выше них не вырастет; `redis_serverless_snapshot_arn` — копия, из которой создаётся кэш.

## Шаги владельца (только если «Авто» написал «пора переходить»)

Путь AWS: «Restoring from a backup into a new cache» — копия узлов восстанавливается в новый Serverless. Живой репликации из узлов в Serverless у AWS нет, поэтому есть короткая пауза записи (минуты), зато без потери данных.

1. Ночь, мало людей онлайн (по вашему времени, Невада: 01:00–04:00).
2. Пауза записи: Админка → «Система» → «Очереди» → «Пауза» (фоновые задачи стоят) и AWS Console → ECS → Clusters → `lawbid-prod` → Services `api`, `api-admin`, `worker` → Update service → Desired tasks = 0. Сайт и приложение покажут «Нет соединения» на эти минуты.
3. Копия: AWS Console → ElastiCache → Valkey caches → `lawbid-prod-redis` → Actions → Backup → имя `lawbid-prod-cutover-<дата>` → Create. Дождаться Status = available. Скопировать её ARN.
4. В `infra/envs/prod/terraform.tfvars`: `redis_serverless_mode = "on"`, `redis_serverless_snapshot_arn = "<ARN из шага 3>"`. `terraform plan`: ожидается `aws_elasticache_serverless_cache.this`, пользователь `default`, группа, секрет `REDIS_SERVERLESS_URL`, новая task definition с `REDIS_CLUSTER=true` и другим `REDIS_URL`. Ничего не удаляется. `terraform apply`. Сразу записать те же строки в секрет `lawbid-prod/terraform-tfvars` (KNOWN_ERRORS 87).
5. Вернуть задачи: ECS → те же три сервиса → Desired tasks как было. Очереди → «Продолжить».
6. Проверка (ниже). Узлы остаются ещё 7 дней — это путь назад.

## Как вернуться назад

`redis_serverless_mode = "standby"` → `terraform apply`: приложение снова на узлах (данные, записанные в Serverless после перехода, на узлах не появятся — поэтому назад только в первые часы или через ту же паузу и копию в обратную сторону).

## Как проверить

- `curl -s -o /dev/null -w "%{http_code}" https://api.lawbid.dev/api/v1/health/ready` = 200 (проверка готовности включает Valkey).
- CloudWatch → Metrics → AWS/ElastiCache → `ElastiCacheProcessingUnits` у `lawbid-prod-valkey-sl` растёт, у узлов `CurrConnections` ≈ 0.
- Админка → Очереди: задачи идут, нет растущей очереди.
- «Расходы → Реестр»: строка Valkey Serverless показывает цену.

## Что ещё не сделано (честно)

- Автоматическая смена пароля (`secret_rotation.redis_enabled`) меняет пароль узлов, не Serverless: пока приложение на Serverless, пароль Serverless не меняется сам.
- Удаление узлов после перехода — отдельный шаг (модуль `redis` всегда создаёт группу узлов); пока узлы стоят, платим за оба.
