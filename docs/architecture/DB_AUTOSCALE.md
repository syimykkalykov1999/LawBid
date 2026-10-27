# Автомасштабирование базы данных (RDS) / Database autoscale

Владелец 2026-10-24: база сама растёт и сама уменьшается, платим за размер
только когда он нужен. Код: `infra/modules/db-autoscale` (Terraform + Lambda),
включается в стеке флагом `db_autoscale_enabled` (в prod по умолчанию `true`).
Инструкция «как выключить / как задать размер вручную»:
[docs/runbooks/db-autoscale.md](../runbooks/db-autoscale.md).

## Кратко, простыми словами

**Что делает.** Каждые 5 минут маленькая программа (Lambda) смотрит, как база
себя чувствует. Если ей тяжело, она сама переводит базу на **один размер
больше** и пишет вам письмо. Раз в сутки, в 03:30 ночи по Чикаго, она смотрит
на последние 3 суток: если все 3 суток было спокойно, переводит на **один
размер меньше** и тоже пишет письмо. Вы ничего не нажимаете.

**Когда растёт (любое одно условие):**
- процессор занят больше 70 % подряд 15 минут;
- свободной памяти меньше 10 % подряд 15 минут;
- соединений больше 80 % от предела подряд 10 минут (или один замер выше 92 %: база вот-вот перестанет пускать);
- у «экономных» баз `t4g` кончились кредиты процессора (дальше AWS берёт доплату или база тормозит).

**Когда уменьшается (только ночью, всё сразу):** за 72 часа процессор ни разу
не поднимался выше 30 %, соединений не больше 40 % от предела, памяти хватало;
и на меньшем размере запас остаётся (иначе база сразу бы выросла обратно, это
«качели», и мы их не допускаем).

**Пауза.** Смена размера = короткое переключение на запасную копию: около
1 минуты без базы (вы это согласовали). Приложение переподключается само.
Пока Multi-AZ ещё не включён (до воскресенья), автомасштабирование стоит и ничего
не трогает: на одной копии смена размера дала бы простой на несколько минут.

**Предохранители («ничего не сломать»):**
- не трогает базу, если она не `available` или у неё уже есть незавершённое изменение;
- не трогает во время выкладки новой версии (идёт ECS rollout api/worker) и пока работает разовая задача (миграции, переводы);
- вверх не чаще раза в 30 минут; вниз не чаще раза в 72 часа и не раньше 72 часов после любого увеличения;
- потолок `db_autoscale_max_class` (по умолчанию `db.r7g.xlarge`, ≈ $698/мес) и пол `db_autoscale_min_class` (`db.t4g.micro`);
- на потолке при высокой нагрузке только письмо «нужно ваше решение», сама выше не лезет;
- если что-то непонятно (нет данных, не удалось прочитать ECS, незнакомый размер) она **ничего не делает**;
- рубильник без Terraform: параметр SSM `on` / `dry-run` / `off` (в `dry-run` только пишет письма, что сделала бы).

**Сколько стоит база (сам экземпляр, с Multi-AZ, в месяц, примерно):**

| Шаг | Размер | Память | Соединений | $/мес |
|---|---|---|---|---|
| 1 | db.t4g.micro | 1 ГБ | ~99 | ≈ 23 |
| 2 | db.t4g.small | 2 ГБ | ~198 | ≈ 47 |
| 3 | db.t4g.medium | 4 ГБ | ~396 | ≈ 94 |
| 4 | db.t4g.large | 8 ГБ | ~792 | ≈ 188 |
| 5 | db.r7g.large | 16 ГБ | ~1585 | ≈ 349 |
| 6 | db.r7g.xlarge (потолок по умолчанию) | 32 ГБ | ~3171 | ≈ 698 |
| 7 | db.r7g.2xlarge | 64 ГБ | 5000 | ≈ 1396 |

Цены: AWS Price List API, us-east-1, PostgreSQL, Multi-AZ, по часу × 730, на
2026-10-24; **примерные**. Диск (gp3), резервные копии и Performance Insights
считаются отдельно и от размера не зависят. Без Multi-AZ всё вдвое дешевле.
Сам автомасштаб стоит меньше $1 в месяц (Lambda в бесплатной квоте, около
35 тысяч запросов метрик ≈ $0.35). Если база месяц живёт на ступени 3 вместо
фиксированной ступени 6, экономия ≈ $600.

**Чего стоит бояться (коротко):** резкий всплеск соединений быстрее реакции
(мы ловим его отдельным быстрым условием, но до пяти минут запаздывания
остаётся); пока в проде нет «боевого» опыта, первые дни лучше пустить в
`dry-run`. Полный список рисков ниже.

---

## 1. Research notes

Checked live (read-only AWS CLI, account 047754151252, us-east-1) on 2026-10-24:

- `lawbid-prod-postgres`: PostgreSQL **16.13**, `db.t4g.micro`, `available`,
  **single-AZ now**, `PendingModifiedValues = {MultiAZ: true}` (applied in the
  Sunday window). Parameter group `lawbid-prod-postgres16`; `max_connections` is
  the RDS default `LEAST({DBInstanceClassMemory/9531392},5000)`, so it follows
  the class by itself after a resize (static parameter, but the class change
  reboots the instance anyway).
- `describe-orderable-db-instance-options` for engine 16.13: all seven
  ladder classes are orderable, Multi-AZ capable and accept gp3. t4g
  (Graviton2) and r7g (Graviton3) both support PostgreSQL 16.
- Prices: AWS Price List API (`pricing get-products`, AmazonRDS, PostgreSQL,
  Multi-AZ, us-east-1). Hourly: 0.032 / 0.065 / 0.129 / 0.258 / 0.478 / 0.956 /
  1.913. Multi-AZ is exactly 2x single-AZ.
- Lambda account limit is **10 concurrent executions** (unreserved 10), so a
  reserved-concurrency setting is not allowed; overlap is handled by the
  status / pending checks (RDS also refuses a second modify).
- The same instance already has an admin one-click «Увеличить»
  (`apps/api/src/common/ops/aws-capacity.service.ts`, `DB_TIERS` in
  `economy.rules.ts`, a t4g-only chain). A manual change is detected by the
  Lambda (see 3.4) and starts the same 72 h no-down cooldown.

From the AWS documentation (RDS User Guide, "Modifying an Amazon RDS DB
instance", "Multi-AZ DB instance deployments", "Burstable performance"; not
re-fetched in this session, treat the numbers as approximate):

- `ModifyDBInstance` with `ApplyImmediately=true` starts the class change now;
  with `false` it waits for the maintenance window (here Sunday 04:30-05:30
  UTC), which is useless for an autoscaler. Status goes `modifying`, then
  `available`.
- **Multi-AZ instance deployment:** RDS changes the **standby** first, fails over
  to it, then changes the old primary. Outage = the failover, normally
  60-120 s; connections drop and must reconnect (Prisma does). **Single-AZ:** the
  instance is down for the whole change, several minutes. That is why the
  autoscaler refuses a non-Multi-AZ database (`require_multi_az`).
- **t4g/t3 on RDS run in Unlimited mode by default**: at zero credits the CPU is
  not throttled, but surplus credits are billed (≈ $0.075 per vCPU-hour). So
  "credits near 0" means "we are paying extra for a too-small class": grow.
  Baselines (CPU % without spending credits): micro 10, small 20, medium 20,
  large 30. CloudWatch metrics: `CPUCreditBalance`, `CPUSurplusCreditBalance`.
- **Read replicas (PostgreSQL):** a replica needs `max_connections` at least the
  primary's, otherwise replication stops. So a primary cannot be grown alone
  while replicas exist; the autoscaler pauses and e-mails instead.
- `FreeableMemory` on RDS includes reclaimable OS cache but not shared buffers;
  on a 1 GiB instance it normally sits at 15-40 % free, so the 10 % trigger is
  tight on micro. This is the likeliest source of a "too early" up-step and it is
  cheap (one step, back down after 3 quiet days).
- Well-known patterns: (a) CloudWatch alarm -> SNS/EventBridge -> Lambda ->
  `ModifyDBInstance`; (b) scheduled Lambda evaluating metrics itself;
  (c) Aurora Serverless v2 / Aurora replica autoscaling (different engine, not
  an option for this RDS Postgres). Neither the console nor Terraform has
  vertical autoscaling for plain RDS, so (a)/(b) are the standard answer.

## 2. Design

```
EventBridge Scheduler  rate(5 minutes)      {"mode":"tick"}   ─┐
EventBridge Scheduler  cron(30 3 * * ? *)                       ├─> Lambda db-autoscale (python3.12, arm64)
        tz America/Chicago                  {"mode":"night"}  ─┘     ├─ rds:DescribeDBInstances / ModifyDBInstance (this DB only)
                                                                     ├─ cloudwatch:GetMetricData
                                                                     ├─ ecs:DescribeServices / ListTasks (this cluster)
                                                                     ├─ ssm:Get/PutParameter  <name>/db-autoscale/{mode,state}
                                                                     └─ sns:Publish -> existing alerts topic -> owner e-mail
```

**Why a 5-minute tick and not four CloudWatch alarms.** The thresholds depend
on the current class (80 % of `max_connections`, 10 % of memory), and a static
alarm threshold cannot follow a ladder that changes under it. The Lambda reads
the live class and applies the same rules to it, so one evaluator covers all
four triggers. The tick is as fast as a 1x5-minute alarm. The Lambda's own
failure is an alarm (`<name>-db-autoscale-errors`) to the same topic.

Files: `main.tf` (resources), `lambda/decision.py` (pure `decide()`, messages),
`lambda/handler.py` (AWS I/O), `lambda/tests/` (49 tests, stdlib `unittest`).

### 2.1 Scale-up (mode tick)

Series of 5-minute points over the last 20 minutes:

| Trigger | Rule |
|---|---|
| CPU | `CPUUtilization` average > 70 % in each of the last 3 points (15 min) |
| Memory | `FreeableMemory` < 10 % of the class memory, last 3 points |
| Connections | `DatabaseConnections` maximum > 80 % of `max_connections` in the last 2 points (10 min), or the last point > 92 % |
| Credits (t4g only) | `CPUCreditBalance` < 20 in the last 3 points |

Result: `ModifyDBInstance(DBInstanceClass=next, ApplyImmediately=True)`, one
step, never above `max_class`. A missing data point never counts as a trigger.

### 2.2 Scale-down (mode night)

Only if local time is 01:00-06:00 America/Chicago (the schedule already says
03:30; this guards manual invocations and DST) and all of this holds over the
last **72 h** (864 five-minute points, at least 85 % present):

- max CPU < 30 %, max connections < 40 % of the current limit, min free memory >= 30 %;
- no up-trigger right now;
- the **smaller size has room** (anti-flap): projected max CPU (scaled by vCPU
  ratio) <= 60 %; on a burstable target, projected average CPU <= 80 % of its
  baseline (so credits do not run out); peak connections <= 60 % of the target
  limit; memory in use <= 70 % of the target memory.

Then one step down, never below `min_class`.

### 2.3 Cooldowns and guards

- up: no more than once per 30 min after any size change;
- down: no sooner than 72 h after any size change (ours or a manual one);
- skip (reason logged) when: status != `available`; `PendingModifiedValues`
  not empty (this also covers the Multi-AZ switch pending until Sunday);
  database has read replicas (e-mail once a week); database is not Multi-AZ
  (`require_multi_az`); an ECS **rollout is in progress** for the api or worker
  service (more than one deployment, or `rolloutState = IN_PROGRESS`); a
  **one-off task** is running in the cluster (a task whose group is not
  `service:*`: migrations, i18n); the ECS state could not be read; the class is
  not in the ladder.
- fail-safe: any exception means no resize; unknown switch value means `off`.

### 2.4 State, switch, notifications

- State is an SSM parameter `/<name>/db-autoscale/state` (JSON: last seen class,
  `last_up`, `last_down`, `last_change`, e-mail throttle stamps). SSM instead of
  DB tags: Terraform would remove foreign tags from a Terraform-managed
  `aws_db_instance`, and the Lambda needs no `AddTagsToResource`. If the class
  seen differs from the stored one, somebody changed it by hand (admin button,
  console): recorded as a change now (blocks a down for 72 h).
- Switch `/<name>/db-autoscale/mode` = `on` | `dry-run` | `off`; Terraform sets
  the first value and then ignores it (a deploy never re-enables a switch the
  owner turned off).
- E-mail through the existing alerts SNS topic (module.monitoring), e.g.
  «База увеличена: db.t4g.micro → db.t4g.small (нагрузка CPU 78 %). Цена ≈
  $47/мес (было ≈ $23). При переключении будет короткая пауза, около минуты.»
  and «База уменьшена: ... экономия ≈ $47/мес.», «... уже на потолке ...»,
  «Автомасштабирование базы стоит на паузе: ...».

### 2.5 Terraform integration

- `modules/stack`: variables `db_autoscale_{enabled,min_class,max_class,mode,ladder,tuning}`;
  module `db_autoscale` created when enabled and a database is named
  (`create_database` or `existing_database_identifier`). Prod DB is
  created outside Terraform, so Terraform never owns its `instance_class`;
  `modules/postgres` already had `ignore_changes = [instance_class]` (owner
  2026-10-16, admin button) and `modules/growth` the same for replicas, so a
  Terraform-managed database (staging, loadtest) is also safe.
- **`db_connection_budget`**: pool size per task is a task env var fixed at
  apply, so it is computed from the **smallest** class the database may shrink to
  (`db_autoscale_min_class`) and the check asks that the **largest**
  (`db_autoscale_max_class`) can carry the peak task count. With prod's
  `api_max_tasks = 50`, `worker_max_tasks = 20` (peak 140 tasks) the pool is
  3 either way (as before), and the check passes at `db.r7g.xlarge` (3171).
- `rds_primary_instance_class` (growth module) is only the default class of NEW
  read replicas; with autoscale on it keeps its meaning. A `check` warns when
  `growth.rds_read_replicas > 0` together with autoscale (the Lambda would pause).
- `OPS_DB_INSTANCE` (API env) now names the database also when it is the
  existing one, so the admin «Экономика» / здоровье системы shows the current
  class. No UI change. Its IAM already allowed the instance name.
- Loadtest: `db_autoscale_enabled = false` (variable present, off). The
  loadtest bootstrap role needs **no change while it is off**. To turn it on:
  add `lambda:*`, `scheduler:*`, `iam:PassRole` to `lambda.amazonaws.com` /
  `scheduler.amazonaws.com` (roles `lawbid-loadtest-*`), `cloudwatch:PutMetricAlarm`
  for `lawbid-loadtest-*`, and note the database must be Multi-AZ
  (loadtest is single-AZ by design, so the Lambda would only e-mail "paused").
- Staging: off (single-AZ).

## 3. Risks

1. **Pause**: about 1 min of failed connections on every step (accepted).
   Prisma reconnects; in-flight transactions fail and are retried by the app.
2. **Prod is single-AZ until Sunday**: the Lambda stays idle (pending-modification
   guard). After Sunday check that the first mail is not "pause: not Multi-AZ".
3. **Deploy race**: the guard sees a rollout in progress or a one-off task, but
   not the seconds between `run-migrations` ending and `roll-services` starting.
   Residual risk is small (a resize needs a trigger that moment).
4. **Connection burst faster than the DB** (tasks scale in ~1-2 min, the DB step
   takes the next tick plus the pause): pool is 3 per task, so a micro DB (≈ 99)
   fills at ≈ 33 tasks. The 92 % fast trigger reacts within one tick.
5. **Memory trigger on micro** may fire early (see research); cost is one step.
6. **Down-step wrongly judged**: protected by the projection checks and by the
   30 min up-cooldown being short; worst case is a quick up-step the next day.
7. **Manual / admin changes** are detected by class mismatch, not by event. The
   admin one-click («Экономика») now uses the SAME seven-step ladder
   (`DB_TIERS` in `economy.rules.ts`, Multi-AZ prices), so the two never
   disagree on the next size; an admin step counts as a change and blocks a
   scale-down for 72 h. `db.t4g.xlarge` ($0.517/h, 16 GiB) and `db.t4g.2xlarge`
   ($1.034/h, 32 GiB) were deliberately NOT put on the ladder: they cost more than
   `db.r7g.large` ($0.478/h, 16 GiB) and `db.r7g.xlarge` ($0.956/h, 32 GiB) for
   the same memory, and a step up from t4g.2xlarge to r7g.large would lose memory.
   A class outside the ladder is left alone (`unknown_class`) until set back with `force`.
8. **Read replicas** block autoscale (documented, mailed weekly).
9. **Cost**: ceiling `db.r7g.xlarge` ≈ $698/month; the monthly budget alarm
   (`monthly_budget_usd = 350`) will fire there: raise the budget before raising the ceiling.
10. Prices are approximate and hard-coded in `local.class_specs`; refresh when AWS
    changes them (the message price is informational, billing is AWS's).

## Read replica and this autoscaler (2026-10-24)

A replica made by the admin button «Копия базы для чтения» (or by `growth.rds_read_replicas`) makes the Lambda stop with reason `has_replicas` (it reads `ReadReplicaDBInstanceIdentifiers`), exactly as described in section 1 and `check "db_autoscale_vs_replicas"`: nothing is resized, the weekly e-mail says why. The primary and the replica are then sized by hand together. The button creates the replica in the CURRENT class of the primary. Details: `docs/runbooks/db-replica.md`.
