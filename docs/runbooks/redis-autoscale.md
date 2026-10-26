# Автомасштабирование Redis: как это работает и как управлять

Устройство и расчёты: [docs/architecture/REDIS_AUTOSCALE.md](../architecture/REDIS_AUTOSCALE.md).
Имя в AWS (prod): Lambda `lawbid-prod-redis-autoscale`, параметры SSM
`/lawbid-prod/redis-autoscale/mode` и `/lawbid-prod/redis-autoscale/state`,
группа `lawbid-prod-redis`, регион us-east-1.

## Как это работает (коротко)

- Каждые 5 минут Lambda смотрит нагрузку на оба узла. Тяжело (процессор Redis
  > 70 % 15 минут, память > 75 % 15 минут или один замер > 92 %, кончились
  кредиты t4g) — Redis переходит на **один размер больше**, вам приходит письмо.
- Каждую ночь в 03:30 (Чикаго): если 72 часа подряд было спокойно (процессор
  < 30 %, память < 40 %) и на меньшем размере хватит места — **один размер
  меньше**, письмо с экономией.
- Смена размера = онлайн, пауза записи в момент переключения узлов (секунды,
  иногда до минуты). Адрес `REDIS_URL` не меняется.
- Не работает во время выкладки новой версии, при незавершённом изменении,
  без реплики и автопереключения, в кластерном режиме.
- Много соединений само по себе размер не меняет (предел 65 000 одинаков у всех
  размеров): приходит письмо раз в сутки.

## Письма и что они значат

| Письмо | Что делать |
|---|---|
| «Redis увеличен: A → B (...)» | Ничего. Если повторяется — Redis мал для нагрузки, это нормально. |
| «Redis уменьшен: A → B (...)» | Ничего. |
| «Redis под большой нагрузкой, но уже на потолке» | Решение за вами: поднять `redis_autoscale_max_class` (и бюджет), либо готовить кластерный режим (напишите Claude). |
| «В Redis много соединений» | Размер не менялся. Напишите Claude «соединения Redis» (вероятна утечка). |
| «Автомасштабирование Redis стоит на паузе: ...» | Нет реплики или автопереключения. Включите `redis_replicas = 1`. |
| «Не удалось изменить размер Redis» | AWS отказал (идёт бэкап, не помещаются данные при уменьшении). Само повторится. |
| «ПРОБНЫЙ РЕЖИМ, ничего не изменено» | Режим `dry-run`: так она бы поступила. |
| Тревога `lawbid-prod-redis-autoscale-errors` | Сбой самой программы. Redis остался как был. Напишите Claude «автомасштаб Redis». |

## Как выключить

Быстро, без Terraform (действует на следующем запуске, до 5 минут):

```bash
aws ssm put-parameter --region us-east-1 --name /lawbid-prod/redis-autoscale/mode --type String --overwrite --value off
```

Значения: `on`, `dry-run` (только письма «что сделала бы»), `off`. Terraform после
создания это значение **не трогает**. Насовсем: `redis_autoscale_enabled = false`
в tfvars прода и «ставь на AWS» (размер Redis останется каким был). Первые дни
разумно поставить `redis_autoscale_mode = "dry-run"` перед первым применением.

## Как задать размер вручную

1. Выключите автомасштаб (команда выше).
2. Через Lambda (соблюдает проверки, пишет письмо, запоминает время):

```bash
aws lambda invoke --region us-east-1 --function-name lawbid-prod-redis-autoscale \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"force","class":"cache.t4g.medium"}' /dev/stdout
```

   Или кнопка «Увеличить» в админке «Экономика» (та же лесенка), или напрямую:
   `aws elasticache modify-replication-group --replication-group-id lawbid-prod-redis --cache-node-type cache.t4g.medium --apply-immediately`.
3. Ручная смена считается изменением: 72 часа автомасштаб не уменьшает Redis.

Посмотреть, что она видит: `--payload '{"action":"status"}'`; логи
`/aws/lambda/lawbid-prod-redis-autoscale` (строка `decision` с причиной:
`calm`, `deploying`, `no_failover`, `cooldown_down`, `target_memory_tight`...).

## Как изменить потолок и пол

```hcl
redis_autoscale_max_class = "cache.r7g.xlarge"   # потолок (по умолчанию cache.r7g.large, ≈ $320/мес)
redis_autoscale_min_class = "cache.t4g.small"    # пол (по умолчанию cache.t4g.micro)
```

Важно: `redis_node_type` в tfvars после запуска ничего не значит (Terraform его
не применяет). Если меняете `redis_replicas`, сначала впишите в `redis_node_type`
текущий размер (`aws elasticache describe-replication-groups ...`).

## Цены по ступеням

Группа с одной репликой (2 узла), on-demand, us-east-1, ≈ в месяц (AWS Price List API,
2026-10-24; примерные):

| Ступень | Размер | Память узла | $/узел-час | $/мес |
|---|---|---|---|---|
| 1 | cache.t4g.micro | 0,5 ГБ | 0,016 | ≈ 23 |
| 2 | cache.t4g.small | 1,37 ГБ | 0,032 | ≈ 47 |
| 3 | cache.t4g.medium | 3,09 ГБ | 0,065 | ≈ 95 |
| 4 | cache.r7g.large (потолок) | 13,07 ГБ | 0,219 | ≈ 320 |
| 5 | cache.r7g.xlarge | 26,32 ГБ | 0,437 | ≈ 638 |
| 6 | cache.r7g.2xlarge | 52,82 ГБ | 0,873 | ≈ 1275 |

## Если что-то пошло не так

- Redis после смены «висит» дольше 5 минут: консоль ElastiCache → Events. Не
  запускайте второе изменение, пока статус не `available`.
- «Качели» (вверх-вниз каждые несколько дней): поднимите `redis_autoscale_min_class`
  на ступень выше текущей или `redis_autoscale_tuning = { down_window_h = 120 }`.
- Хотите отключить уменьшение, но оставить рост: `redis_autoscale_min_class` = текущий размер.
- Кластерный режим (горизонтальное масштабирование): см. раздел 3 архитектурного
  документа; это решение владельца, автоматики нет. Дешёвый шаг раньше:
  отдельный узел под кэш ([redis.md](redis.md) «Разделение»).
