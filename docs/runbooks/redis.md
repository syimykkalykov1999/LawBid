# redis-cpu / redis-memory — ElastiCache CPU above 80 %, memory above 70 %

> **Для владельца:** Обычно проходит само. Держится больше суток — увеличить Redis при следующем «ставь на AWS». Все письма и кнопки: [OWNER.md](OWNER.md).

Redis carries cache, rate limits, BullMQ queues, Socket.IO adapter,
counters (docs/06 §6.3); it is not a source of truth (§6.4).

**Check.** *Database & Redis* board; `INFO keyspace` from a maintenance
shell — which prefixes grow (`bull:*`, `rl:*`, `sub:*`, `cnt:*`)?
BullMQ backlog → [queues.md](queues.md).

**Act.** Memory: clear a runaway key family after confirming it is
regenerable (caches have TTLs; queues must not be flushed). CPU: scale the
node type (`redis_node_type`) — apply in the maintenance window
(`apply_immediately = false`). Failover is automatic (multi-AZ).

## Разделение (plan, owner 2026-10-22 — sizes unchanged for now)

Today one Redis (`lawbid-prod-redis`, launch size `cache.t4g.micro`, no
replica) holds everything with `maxmemory-policy = noeviction`. That policy
is required for BullMQ (an evicted job key corrupts a queue) and right for
the Socket.IO adapter / presence, but wrong for caches: when memory is full,
`noeviction` refuses **every** write, so a growing cache can stop the queues
and realtime too. Industry practice (BullMQ docs «Going to production»,
AWS ElastiCache best practices) is two Redis: queues/realtime on
`noeviction`, cache on `allkeys-lru`.

| Redis | Holds | Policy | Terraform |
|---|---|---|---|
| main (`REDIS_URL`) | BullMQ `bull:*`, Socket.IO adapter, presence, rate limits `rl:*`, counters `cnt:*`, badges | `noeviction` | `module.redis` (as today) |
| cache (`REDIS_CACHE_URL`) | feed page cache, other TTL caches | `allkeys-lru` | `module.redis_cache`, `redis_cache_node = true` |

Steps when memory of the main Redis stays above ~60 % or before growth:

1. `redis_cache_node = true` (optional `redis_cache_node_type`, default
   `cache.t4g.micro` ≈ $12/month, no replica — a lost cache only costs a
   refill) → `terraform plan` / `apply`. Terraform creates the node and the
   `lawbid-prod-cache/REDIS_URL` secret, and injects it as `REDIS_CACHE_URL`
   into api / worker (a new task definition revision).
2. App change (not done yet): cache code reads `REDIS_CACHE_URL` when set,
   falls back to `REDIS_URL`. Rate limits and badges stay on the main Redis
   (they must not be evicted).
3. After deploy: watch `DatabaseMemoryUsagePercentage` of both; then flush
   the old cache prefixes from the main Redis.

The `maxmemory_policy` variable of `modules/redis` is validated: only
`noeviction` or an LRU/LFU policy; never set the main Redis to an evicting
policy.

## Отказоустойчивость (2026-10-22): реплика и автопереключение

`redis_replicas = 1` (переменная в `terraform.tfvars`) добавляет к основному
узлу одну реплику в другой зоне доступности: Multi-AZ с автоматическим
переключением (ElastiCache replication group, `automatic_failover_enabled`,
`multi_az_enabled`). Размер реплики равен основному: самый маленький класс,
который это поддерживает, `cache.t4g.micro` (семейство T1 не умеет, T4g
умеет). Сейчас на запуске `redis_replicas = 0`.

**Адрес для приложения не меняется:** `REDIS_URL` — это *primary endpoint*
группы; после переключения AWS переводит его на новый основной узел
(обновление DNS, TTL 15 с). Менять секрет и перезапускать задачи не нужно.

**Что происходит при поломке основного узла или зоны:** AWS сама назначает
реплику основной (обычно меньше минуты, до 1–2 минут) и создаёт новую
реплику. На это время запись в Redis недоступна; приложение переподключается
само (очереди BullMQ и Socket.IO возобновляются, часть кэша может
потеряться). Репликация асинхронная: записи последних долей секунды могут не
успеть, это допустимо, Redis у нас не источник правды (docs/06 §6.4).
**Без реплики** перезапуск или поломка узла = несколько минут простоя Redis
(замена узла), пока он не поднимется.

Сигнал `…-redis-replication-lag-002`: реплика отстаёт больше 30 секунд
(3 замера по 5 минут). Если не проходит за час, нагрузка на запись выше, чем
тянет `cache.t4g.micro`: поднять `redis_node_type`. Обслуживание (патчи)
идёт тоже с переключением, окно `sun:05:00-06:00`.

Цена: вторая нода того же класса. `cache.t4g.micro` ≈ **+$12 в месяц**
($0.016/ч); `cache.t4g.medium` ≈ +$47; полноразмерный `cache.r7g.large` ≈
+$190. Включение: `terraform apply` (реплика добавляется на лету, основной
узел не перезапускается; создание несколько минут). Нужны подсети минимум в
двух зонах (проверка в модуле).

## Подключения и аварийное переключение (2026-10-25, пакет S6)

Все клиенты Redis (основной, кэш, очереди BullMQ) создаёт одно место:
`apps/api/src/redis/redis-connection.ts`. Что оно делает само:

- **READONLY после переключения.** Если соединение осталось на бывшем
  основном узле, Redis отвечает `READONLY`. Клиент переподключается (адрес
  заново берётся из DNS, TTL 15 с) и повторяет команду. Паузы между попытками
  случайные (±50 %), чтобы все задачи не ломились разом.
- **Очереди (producer) не зависают.** Соединение, из которого код кладёт
  задачи в очередь, при недоступном Redis отвечает ошибкой сразу
  (`enableOfflineQueue: false`, 1 повтор, 2 с), а не ждёт минуту. Оно одно на
  процесс для всех очередей. Воркеры очередей остаются со своими
  соединениями и стандартными настройками.
- **Расписание фоновых задач** хранится только в Redis. Каждые 30 секунд
  воркер проверяет, что все расписания на месте, и при потере (замена узла,
  сбой без сохранения) заново их создаёт. Тревога `cron-schedulers-missing`
  говорит, что это случилось. Перезапуск не нужен.
- **Автоконвейер** (`REDIS_AUTOPIPELINE`, по умолчанию включён): команды
  одного такта уходят одним пакетом. Поставьте `false` и перезапустите
  сервис, если нагрузочный тест покажет проблему.
- **Замки задач** (`withJobLock`) продлеваются каждую треть срока; если замок
  потерян, задача прерывается сигналом, ничего не ломая (задачи идемпотентны).

### Смена пароля Redis (ROTATE → SET)

`auth_token_update_strategy = "ROTATE"` принимает старый и новый пароль до
шага SET. Клиент `REDIS_CLIENT`, клиент кэша и общий producer при ошибке
`WRONGPASS`/`NOAUTH` сами заново читают секрет (файл `REDIS_URL_FILE`, если он
подключён, иначе переменную `REDIS_URL`), меняют пароль и переподключаются
(не чаще раза в 5 секунд). **Но** воркеры очередей BullMQ и сокеты Socket.IO
держат свои соединения, поэтому порядок такой:
1. Выполните ROTATE (в Terraform: новый пароль, стратегия ROTATE).
2. Обновите секрет `REDIS_URL` и сделайте **rolling redeploy** api и worker
   (ECS → Update service → Force new deployment, по одному сервису).
3. Только после того как все задачи новые, выполните шаг SET.
Если SET сделан раньше, работающие воркеры получат `WRONGPASS` до перезапуска.

### Новые тревоги (modules/monitoring)

`redis-cpu-credits` (только t4g), `redis-network-allowance`,
`redis-traffic-management`, `redis-connections`, `redis-new-connections`,
`redis-cache-evictions` (если есть кэш-узел), `cron-schedulers-missing`.
Метрики узла берутся с узла `<группа>-001`; после переключения основным
может стать `-002`: тогда эти тревоги молчат (ничего не ломается), их надо
перенаправить при следующем `terraform apply`.

### Redis Cluster: что проверяет CI

`redis-cluster-scan.spec.ts` (нет «голых» клиентов, у каждого многоключевого
вызова записана причина) и `redis-lua-slots.spec.ts` (каждый Lua-скрипт
обращается только к ключам из `KEYS[]`; ключи одного скрипта попадают в один
из трёх шардов). `REDIS_BULL_PREFIX={bull}` кладёт все очереди в один слот;
включайте только на пустом Redis (имена очередей меняются).
