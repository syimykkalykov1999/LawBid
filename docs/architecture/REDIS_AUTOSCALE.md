# Автомасштабирование Redis (ElastiCache) / Redis autoscale

Владелец 2026-10-24: Redis сам растёт под нагрузкой и сам уменьшается, как база
(см. [DB_AUTOSCALE.md](DB_AUTOSCALE.md)). Код: `infra/modules/redis-autoscale`
(Terraform + Lambda), включается в стеке флагом `redis_autoscale_enabled` (в
prod по умолчанию `true`). Инструкция «как выключить / задать размер вручную /
цены»: [docs/runbooks/redis-autoscale.md](../runbooks/redis-autoscale.md).

## Кратко, простыми словами

**Что делает.** Каждые 5 минут маленькая программа (Lambda) смотрит, как себя
чувствует `lawbid-prod-redis`. Если ему тяжело, она переводит оба узла (основной
и реплику) на **один размер больше** и пишет вам письмо. Раз в сутки, в 03:30
ночи по Чикаго, она смотрит последние 3 суток: если все 3 суток было спокойно,
переводит на **один размер меньше** и тоже пишет письмо. Вы ничего не нажимаете.
Кнопка в админке «Экономика» двигает Redis по **той же лесенке**.

**Когда растёт (любое одно условие, держится 15 минут):**
- процессор движка Redis (`EngineCPUUtilization`) выше 70 %;
- память (`DatabaseMemoryUsagePercentage`) выше 75 % (или один замер выше 92 %: Redis у нас с `noeviction`, при 100 % он перестаёт принимать записи, а на них стоят очереди);
- у «экономных» `t4g` кончились кредиты процессора.

**Соединения.** Предел `maxclients` у ElastiCache один на все размеры
(65 000), больший узел его **не поднимает**. Поэтому, если высоко только число
соединений (больше 80 % предела 15 минут), размер не меняется: приходит письмо
«много соединений, похоже на утечку», раз в сутки. Если одновременно высок
процессор или память, соединения просто указаны в причинах письма. (Отличие от
первоначального задания: там соединения были самостоятельной причиной роста; я
счёл это бесполезной тратой денег. Если нужно иначе, это одна строка в
`_decide_up`.)

**Когда уменьшается (только ночью, всё сразу):** за 72 часа процессор ни разу
не поднимался выше 30 %, память ни разу не была выше 40 %, и на меньшем размере
остаётся запас (память после уменьшения не выше 60 %, процессор не выше 50 %,
а у `t4g` ещё и в пределах «базовой» нормы), иначе размер сразу вырос бы обратно
(«качели»).

**Пауза.** Смена размера у реплицируемого Redis (один узел-реплика + автопереключение)
**онлайн**: AWS поднимает новые узлы нужного размера рядом, синхронизирует,
переключает основной узел на новый (failover) и убирает старые. Для приложения
это секунды (иногда до минуты) недоступности записи в момент переключения;
очереди BullMQ и сокеты переподключаются сами. Пока автопереключение не
включено (сейчас в проде оно «в ожидании» — применится в окно обслуживания),
автомасштабирование стоит и ничего не трогает.

**Предохранители:**
- не трогает, если группа не `available`, есть незавершённое изменение, нет реплики или автопереключения, Redis в кластерном режиме;
- не трогает во время выкладки новой версии (ECS rollout api/worker) и пока работает разовая задача;
- перед сменой спрашивает у AWS (`ListAllowedNodeTypeModifications`), разрешён ли такой переход;
- вверх не чаще раза в 30 минут; вниз не чаще раза в 72 часа и не раньше 72 часов после любого изменения (в том числе ручного);
- потолок `redis_autoscale_max_class` (по умолчанию `cache.r7g.large`, ≈ $320/мес с репликой) и пол `redis_autoscale_min_class`;
- на потолке: только письмо «нужно ваше решение»;
- если что-то непонятно (нет данных, не удалось прочитать ECS, незнакомый размер), **ничего не делает**;
- рубильник без Terraform: параметр SSM `on` / `dry-run` / `off`.

**Terraform не откатывает.** В `modules/redis` у группы стоит
`lifecycle { ignore_changes = [node_type] }`, поэтому «ставь на AWS» не вернёт
старый размер. Побочный эффект: значение `redis_node_type` в tfvars после
запуска ничего не значит, это только стартовый размер.

**Сколько стоит (группа: основной + 1 реплика, в месяц, примерно):**

| Шаг | Размер | Память узла | $/мес |
|---|---|---|---|
| 1 | cache.t4g.micro | 0,5 ГБ | ≈ 23 |
| 2 | cache.t4g.small | 1,37 ГБ | ≈ 47 |
| 3 | cache.t4g.medium | 3,09 ГБ | ≈ 95 |
| 4 | cache.r7g.large (потолок по умолчанию) | 13,07 ГБ | ≈ 320 |
| 5 | cache.r7g.xlarge | 26,32 ГБ | ≈ 638 |
| 6 | cache.r7g.2xlarge | 52,82 ГБ | ≈ 1275 |

Цена за узел в час (AWS Price List API, us-east-1, Redis, on-demand, 2026-10-24):
0,016 / 0,032 / 0,065 / 0,219 / 0,437 / 0,873, умножено на 730 часов и на 2 узла.
Без реплики вдвое дешевле, но тогда автомасштабирование не работает (см. выше).
Сама автоматика стоит меньше $1 в месяц.

**Горизонтальное масштабирование (кластерный режим) — НЕ автоматическое.** Это
следующая ступень, аналог шардирования базы: решение владельца, а не Lambda.
Письмо на потолке подсказывает, когда оно нужно (подробности в разделе 3).

**Главные риски:** пауза записи в момент переключения; уменьшение может не
пройти, если данные не помещаются (AWS откажет, письмо раз в 6 часов); первые
дни разумно пустить в `dry-run`; права IAM проверены только по документации,
пока не применено.

---

## 1. Research notes

Checked live (read-only AWS CLI, account 047754151252, us-east-1) on 2026-10-24:

- Группа `lawbid-prod-redis`: Redis **7.1.0**, `cache.t4g.micro`, узлы
  `-001` (primary, us-east-1b) и `-002` (replica, us-east-1a), `ClusterEnabled =
  false`, `MultiAZ = enabled`, **`AutomaticFailover = disabled` с
  `PendingModifiedValues = {AutomaticFailoverStatus: enabled}`** (применится в
  окно обслуживания). Пока это так, автомасштабирование молчит (проверки
  `pending_modification` и `no_failover`).
- `list-allowed-node-type-modifications` для группы: все шесть размеров лесенки
  (`t4g.small/medium`, `r7g.large/xlarge/2xlarge`) разрешены вверх; `t4g.micro` —
  самый маленький. Пересчитывается на каждом шаге.
- Цены: AWS Price List API (`pricing get-products`, AmazonElastiCache, Redis,
  NodeUsage), за узел-час: 0,016 / 0,032 / 0,065 / 0,219 / 0,437 / 0,873.
  Память по каталогу: 0,5 / 1,37 / 3,09 / 13,07 / 26,32 / 52,82 ГБ. Сравнение:
  `cache.m7g.large` 6,38 ГБ за 0,158 — ступень между t4g.medium и r7g.large,
  но в лесенку не взята (владелец назвал r7g; r7g.large даёт 13 ГБ за 0,219).
  Старая лесенка админки (`t4g` до `m7g.xlarge`) заменена.
- Уже были: кнопка «Увеличить» в админке (`aws-capacity.service.ts`,
  `REDIS_TIERS` в `economy.rules.ts`) и `ignore_changes = [node_type]` в
  `modules/redis`. Автоматика определяет ручную смену (как у базы) и 72 часа не
  уменьшает после неё.

From the AWS documentation (ElastiCache User Guide, «Online vertical scaling by
modifying node type»; fetched 2026-10-24):

- `ModifyReplicationGroup` with `CacheNodeType` + `ApplyImmediately=true` scales
  **up or down while the group stays online**: ElastiCache creates nodes of the
  new type, synchronizes them, updates the DNS entries and removes the old ones;
  the endpoint in `REDIS_URL` does not change. For Valkey 7.2+/Redis OSS 5.0.5+
  with **automatic failover enabled** the group keeps serving requests; on
  older versions there is a brief interruption of reads and writes on the
  primary while DNS is updated. Duration depends on node type and data size.
- Recommendations: do it at the traffic minimum (hence the night shrink; the
  grow cannot wait for the night), have spare ENI capacity, when scaling down
  make sure the smaller node holds the data (otherwise the request fails).
- `reserved-memory-percent` (default 25 %) is not touched, no custom
  parameter group is needed. Our group uses the stock percent, so
  `DatabaseMemoryUsagePercentage` is relative to the same share on every size.
- Scaling between data-tiering (r6gd) and normal nodes is not supported; our
  ladder has no `d` types.
- Burstable nodes (`t4g`) have `CPUCreditBalance` metrics; baselines per vCPU
  used here: micro 10 %, small 20 %, medium 20 % (same figures as RDS t4g; not
  re-verified for ElastiCache, treat as approximate).
- The Redis engine thread uses one core (`EngineCPUUtilization` is a share of
  that core; `CPUUtilization` is the whole host). That is why the CPU rules use
  the engine metric, and why the shrink check compares **core speed**
  (`speed`: t4g = 1.0, r7g = 1.3, an estimate) and not vCPU count.

## 2. Design

Same structure as the database autoscaler (PR #315), a separate module.

**Why a new module and not a generic db-autoscale.** The shared part is small
(state in SSM, switch, SNS, ECS guards, scheduler: ≈ 120 lines). Everything
that matters differs: API (`ModifyReplicationGroup`, a group of 2+ nodes whose
metrics are per node), namespace and metric names, the guard (replica +
automatic failover instead of Multi-AZ, no read-replica rule), the CPU model
(one engine thread), memory by percent, the connection limit that does not
grow with size, the price per group. A generic module would be a table of
callbacks, and one Lambda bug could then stop both. Cost of the choice: about
200 duplicated lines; each Lambda zip is self-contained.

```
EventBridge Scheduler (5 min tick / 03:30 Chicago night)
  -> Lambda handler.py   (reads: DescribeReplicationGroups, CloudWatch of EVERY node,
  |                       ECS rollouts, SSM mode + state, ListAllowedNodeTypeModifications)
  -> decision.py         (pure: guards, up/down rules, cooldowns, texts)
  -> ModifyReplicationGroup(CacheNodeType, ApplyImmediately) + SNS e-mail + SSM state
```

- **Metrics of both nodes** are merged point by point, worst node wins (max;
  min for credits), so a failover inside the 72 h window changes nothing.
- **Guards, in order:** `not_available` (group or node group not `available`),
  `pending_modification`, `cluster_mode`, `no_failover` (no replica or
  `AutomaticFailover != enabled`), `ecs_unknown`, `deploying`, `oneoff_tasks`.
- **Up** (tick): the triggers of the summary; one step; cooldown 30 min after
  any change; stops at `redis_autoscale_max_class` with an e-mail every 6 h.
- **Down** (night, 01:00-06:00 local): quiet 72 h; 85 % data coverage; no up
  trigger right now; 72 h after the last change; the smaller size has room
  (see the summary); never below `redis_autoscale_min_class`.
- **Manual button** (admin «Экономика», `AwsCapacityService.increase`) steps
  `REDIS_TIERS` (`apps/api/src/common/economy/economy.rules.ts`), the same six
  names and order as the Lambda ladder (`modules/redis-autoscale/main.tf`,
  `ladder`). The Lambda notices the change at the next run and starts the 72 h
  no-shrink cooldown. A spec test fixes the ladder order on the API side.
- **Failure of the Lambda itself:** alarm `<stack>-redis-autoscale-errors`
  (3 errors in 30 min) to the alerts topic. A refused modify is e-mailed at
  most once per 6 hours, not once per tick.

## 3. Horizontal scaling (cluster mode): the later step, not automatic

Vertical scaling stops helping when (a) the largest node of the ladder is still
too small in memory (the data set no longer fits one node: `r7g.2xlarge` is
52,8 ГБ), or (b) the single Redis engine thread is saturated
(`EngineCPUUtilization` above 70 % on `r7g.xlarge` and bigger, sustained), or
(c) the write rate exceeds one primary's network limit. Then the data has to be
split across shards (cluster mode enabled, several node groups), which also
raises the throughput of writes.

Why it is an admin decision, like database sharding, and not a Lambda:
- the application is cluster-ready since 2026-10-24 behind a switch
  (`redis_cluster_mode`, [REDIS_CLUSTER_READY.md](REDIS_CLUSTER_READY.md),
  runbook [redis-cluster.md](../runbooks/redis-cluster.md)); the Lambda skips a
  cluster-mode group (`cluster_mode`) and the stack removes it when the switch
  is `on`;
- converting a non-cluster group to cluster mode is a migration (new group or
  a configuration change with a compatibility mode first), not a resize;
- shard count changes move data (online resharding) and cost money in steps of
  whole node groups.

What the autoscaler does: at the ceiling the e-mail says that when even the
biggest node is tight, the next step is cluster mode and it is a task for
Claude. A cheaper step before it, available today: split the cache into its own
node (`redis_cache_node = true`, [redis.md](../runbooks/redis.md) «Разделение»),
which takes the evictable part of the load off the queue Redis.

## 4. Risks

1. **Pause at the switch.** Seconds up to a minute without writes; queued jobs
   wait, sockets reconnect. Mitigated: only with replica + automatic failover,
   never during an ECS rollout or a one-off task, the shrink at night.
2. **Failover not yet enabled in prod** (pending until the maintenance window):
   the autoscaler is idle until then; nothing to do.
3. **A shrink that does not fit** is refused by AWS; the target-room check keeps
   used memory at or below 60 % of the smaller node, and a refusal is only an
   e-mail.
4. **`noeviction` and fast fill:** a burst can fill a small node between two
   ticks; the one-point 92 % trigger and the 75 %/15 min trigger limit it, but up
   to 5 minutes of delay remain, and the resize itself takes minutes (the old
   node is full meanwhile). The existing `redis-memory` alarm stays.
5. **Estimates** (not measured): t4g baselines for ElastiCache, `speed = 1.3`
   for r7g versus t4g. They only decide when to shrink across the t4g/r7g
   boundary; a wrong guess shows as an up-step a few days later.
6. **IAM** (resource-level ARNs of the group and `<group>-*` nodes) is written
   from the documentation and not applied; a first `dry-run` day will show a
   permission error in the logs and the errors alarm, with no change to Redis.
7. **Terraform and replicas:** after the autoscaler moved Redis, set
   `redis_node_type` in tfvars to the current type before changing
   `redis_replicas`, otherwise a new replica may be created at the old size.
8. **Connection trigger changed** (see the summary).
