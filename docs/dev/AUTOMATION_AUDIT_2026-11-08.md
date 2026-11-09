# Automation audit, 08.11.2026

Owner, 08.11: «каждая автоматика, до последней, должна реально работать». He found «Авто» for table
partitioning on «Масштаб» that silently did nothing. Owner, 08.11 (later): «Авто» stays next to
«Выкл / Вкл», is the default for everything that can be automatic, and must act both ways by itself
(on at the threshold, off when not needed), never only send a message.

Checked on prod 08.11 (origin/main 86d1cee1f, account 047754151252), read-only: Terraform
`terraform.tfvars` + `growth.auto.tfvars.json` of the 08.11 apply, ECS task definitions
`lawbid-prod-api:133` / `lawbid-prod-worker:131` (env and secret NAMES only), SSM parameter names
and dates, CloudWatch Logs Insights over `/lawbid/lawbid-prod/{api,worker}` and the three
autoscale Lambdas (7 to 12 days), RDS / ElastiCache events, CloudTrail, IAM policy simulation of
`lawbid-prod-github-deploy`, GitHub Actions run history. No value of any secret was read.

## Коротко по-русски

- Работает само в обе стороны: число серверов API и фоновых (AWS по нагрузке, потолок по деньгам),
  размер базы (вырос сам 07.11 до db.t4g.medium), копии базы и Redis (сняты сами 08.11 после тихой
  недели), «Экономика» (07–08.11 сама включала и снимала ограничения), лимиты SMS/почты/перевода,
  пауза тяжёлых задач, ночные задачи, резервные копии.
- Сломано и исправлено в этом PR: ночной снимок рекомендаций падал каждую ночь (нет права TRUNCATE);
  три журнала нельзя было делить (нет индексов); «Авто» деления таблиц не имело входа в базу и не
  могло его получить без ручного скрипта; сигналы «пора включить» облака только предлагали;
  размер базы и Redis застревал, когда копии сняты; деплой молча не записывал точку отката.
- Нужен владелец (один раз, шаги ниже): `terraform apply` в `infra/bootstrap`, подтвердить письмо
  подписки SNS, выйти из «песочницы» SES, GitHub App для облака, собрать образ PgBouncer.

## What «автоматика» means here (the bar every row is held to)

1. Acts by itself in BOTH directions (on and off), not only an alert.
2. Hysteresis: on after the signal holds N minutes, off after M hours without it; one step at a time.
3. The money ceiling is respected (economy allowance, AWS budget, per-item cap).
4. Every step leaves a log row and a message to the on-call admins.
5. A dry-run test proves the decision logic.
Only a genuinely irreversible data move may stop at «prepared, one tap»; each such case is named below.

## The threshold → cloud change pipeline (end to end)

Before this PR:
`registry.signals()` (economy pressures, budget ratio) + `search.engine` → `infraSuggestions()`
(`infra-change.logic.ts`) → shown on «Масштаб» as «пора включить X» → the owner pressed Вкл →
`InfraChangeService.create(adminId)` → row `infra_change_requests` → `InfraGithubClient.dispatch` →
`.github/workflows/infra-apply.yml` (plan, `plan-summary.mjs` refuses data loss) → `planReady` →
owner's fresh 2FA `confirm` → workflow polls `decision` → `terraform apply plan.bin` → JSON recorded
on main → `report done`. **It stopped at the owner's tap: no threshold ever changed the cloud.**

After this PR (`apps/api/src/modules/admin-launch/infra/infra-auto.*`):
`InfraAutoService` (one API task per 10 min, Redis lock, like `HaAutoService`) reads the same
signals plus two new ones (a partition table near `partition.auto_rows` without a runner login;
a direct DB pool below 8 per task without the pooler) → `autoWants` → `dueWants` hysteresis
(`infra.auto_on_minutes` = 30, `infra.auto_off_hours` = 72, first-seen times in Redis; a gap forgets
the start) → `autoRefusal` (mode, GitHub App configured, one at a time, `infra.daily_cap`, quiet
hours, money: no switch-on at ≥ 90 % of the AWS month budget or above `infra.auto_max_usd_month`
= $100) → `InfraChangeService.create(SYSTEM_ACTOR_ID, …, {auto: true})` (real, not dry-run) → the
same workflow → `planReady` confirms by itself when the plan only adds (switch-on) or only removes
(switch-off) besides ECS task-definition revisions; any other plan waits for the owner → apply →
message to the on-call admins on start and on finish; anything held back (money, setup) is told
once a day with the reason. Switch-off: only items the automation itself switched on, after 72 h
without their signal. Over-budget switch-offs of WAF / Macie / Synthetics / Container Insights stay
proposals on purpose (turning detective controls off by itself hides problems exactly when money is
short; AWS Budgets actions likewise only restrict, never disable detection).
Proven pattern used: AWS Application Auto Scaling / Kubernetes HPA (fast scale-out after a short
stabilization window, slow scale-in after a long cool-down), Terraform saved-plan apply with a plan
guard (the repo's existing `plan-summary.mjs` + IAM Deny list).

Where it still stops (owner, once): GitHub App + `infra_apply_enabled = true` in `infra/bootstrap`
(steps in `docs/runbooks/infra-from-admin.md`). Until then each due step is reported «не настроено»
once a day instead of silently skipped.

## Inventory

Status: **WORKS** = acted on prod by itself (evidence); **WORKS-IDLE** = configured, ran, nothing to
do yet (expected); **FIXED (PR)** = broken or one-way on prod, fixed in this branch (works after
merge + deploy, and the owner step if one is named); **BROKEN** / **NOT CONFIGURED** = needs the
owner step named; **PREPARE+TAP** = deliberately not fully automatic (reason given).

| # | Automation (what it does by itself) | Trigger / hysteresis | Prerequisites | Configured on prod? | Evidence on prod | Status | Owner asked |
|---|---|---|---|---|---|---|---|
| 1 | ECS api/worker task count up/down | AWS target tracking CPU 60 %, ALB req/task, queue depth; in 60 s / out 600 s | `api_max_tasks` 50, `worker_max_tasks` 20, `min_tasks` 1 | yes (scalable targets api 1–10, worker 1–4) | worker 3 → 2 at 20:51 and 20:08 08.11 (scaling activities) | WORKS | «автоматом увеличивался и автоматом уменьшался» 24.10, owner-requests/2026-10-24.md:464 |
| 2 | Economy ceiling: max tasks follow the allowed spend | `economy.guard` every 5 min, +5 per step up, down at once | `OPS_*` env, `application-autoscaling:RegisterScalableTarget` | yes (env present, `economy.ceiling_mode` auto) | live max 10/4 instead of Terraform 50/20 | WORKS (see gap G1) | «если я поставлю потолок … не будет добавлять» 25.10, 2026-10-25.md:228 |
| 3 | Economy «limited» state: caps to floor, video paused, SMS only sign-in, ECS to min; released at ≤ 90 % | projected 3rd-party spend vs allowance | economy_guard flag | yes | 06.11 23:10 «$361 при допустимых $350», 08.11 06:10 «$440»; «Ограничения сняты» 08.11 00:00 and 19:52 | WORKS | 25.10, 2026-10-25.md:228 |
| 4 | DB size up (any time) / down (night, 72 h quiet) | Lambda: CPU > 70 % 3 points, credits, memory, connections; 30 min / 72 h | `db_autoscale_enabled`, SSM mode | yes, SSM mode `on` (since 27.10), max-class db.t4g.large (economy, 08.11 13:52) | 07.11 09:30 and 10:00 RDS «Applying modification to database instance class» by `lawbid-prod-db-autoscale`; now db.t4g.medium (tfvars says micro) | WORKS, but **blocked since 08.11 18:05: `not_multi_az`** → FIXED (PR, #6) | «пусть автоматом ночью делается сама и когда людей в течении 3 дней мало пусть уменьшается» 24.10, 2026-10-24.md:869 |
| 5 | Redis size up/down | same design | `redis_autoscale_enabled`, SSM mode | yes, mode `on` | never acted; every tick 08.11 18:15+ `no_failover` (one node) | BLOCKED → FIXED (PR, #6) | «редиса … автоматически … когда надо» 28.10, 2026-10-28.md:19 |
| 6 | HA copies (Multi-AZ DB, Redis replica + failover) on/off | ≥ 200 online for 3 h on; 7 days under half off; 24 h flip guard. **New:** DB CPU ≥ 70 % or Redis CPU ≥ 70 % / memory ≥ 80 % for 30 min = on at once (size autoscalers need the copies) | IAM rds:ModifyDBInstance, elasticache replica calls | yes (`ha.mode` auto) | 08.11 18:02 `db_multi_az_off`, `redis_failover_off`, 18:12 `redis_replica_down` (API log, RDS / ElastiCache events) | WORKS both ways; gap «busy but no copies» FIXED (PR) | approved «на все да» 24.10, 2026-10-24.md:237-244 |
| 7 | Money ceiling of DB/Redis size (max-class SSM) | economy tick | SSM params, ssm:PutParameter | yes | `/lawbid-prod/{db,redis}-autoscale/max-class` written 08.11 13:52 | WORKS | «потолок до семи 100 $» 28.10, 2026-10-28.md:15 |
| 8 | VPC endpoints created/removed by NAT traffic | Lambda hourly; > 20 GB/day up, 7 quiet days down | `endpoints_autoscale_enabled` | yes, mode `on` | 281 runs in 12 days, «nothing to change» (NAT traffic low) | WORKS-IDLE | memory scaling-principle.md:21 |
| 9 | 3rd-party caps follow usage (SES, Twilio, Translate, Persona) | `cost.autoscale` hourly, 1.5 × peak, floor..ceiling | `BUDGET_*` | yes | «aws spend this month» 168 runs / 7 days | WORKS | COST_LADDER.md:84-91 |
| 10 | Pause heavy jobs while the DB is slow | `ops.guard` every minute, 15 min TTL | — | yes | no slow DB in the window | WORKS-IDLE | 24.10, 2026-10-24.md:963 |
| 11 | Scale to minimum when the AWS budget is spent | `ops.cost-check` hourly | OPS_BUDGET_NAME | yes; budget $450, forecast $402 | not reached | WORKS-IDLE | SWITCH_INVENTORY.md:83 |
| 12 | Table partitioning «Авто» (messages, chat_group_messages, notifications, post_view_events) | `partition.tick` every minute at `partition.auto_rows` 50 M | login of role `lawbid_partition` | **no**: `PARTITION_DATABASE_URL` secret exists (created 03.11 by Terraform) but has **no value**; prod env never passed `partition_role_enabled` (the variable was missing in `infra/envs/prod`) | tick is a no-op (`runnerConfigured` false) | NOT CONFIGURED → FIXED (PR): Terraform generates the login, the migrate task sets it, the pipeline turns the switch on at 80 % of the threshold | «автоматически делить или переходить или по кнопке в админке» 24.10, 2026-10-24.md:950 |
| 13 | Monthly journals (audit_log, auth_events, data_access_log) convertible | precheck | an index starting with the month column; unique keys incl. it | **no**: «Пока нельзя» (audit_log unique `seq` without created_at; auth_events / data_access_log no index on the month column) | admin card | Indexes FIXED (PR: migration 20261120090000 + e2e precheck test). These three have no «Авто» switch and stay converted by a migration only: the runner role must own a table, and the owner of `audit_log` could disable its hash chain (PREPARE+TAP, reason R4). The card now says that instead of offering a «Запустить» that would fail | same |
| 13b | `post_view_events` «Авто» | `partition.post_view_events_mode` | runner role must own it | **no**: 20261112110000 gave the role only the three hash tables | — | NO-OP → FIXED (PR: ownership in 20261120090000) | same |
| 14 | Nightly partition months ahead | `partition.maintain` 02:40 | — | yes | errors only on 03.11 (functions missing then), clean since | WORKS | — |
| 15 | Read replica on/off | was: proposal only; now: DB CPU pressure for 30 min → on; 72 h quiet → off (only if auto turned it on) | infra pipeline | pipeline not connected (GitHub App, bootstrap) | — | FIXED (PR) + owner step O4 | «когда надо будет включить просто вклбчаем» 25.10, 2026-10-25.md:109 |
| 16 | PgBouncer pooler on/off | was: proposal; now: connection pressure or direct pool < 8 per task (prod: 3!) → on; off only after 72 h without both | infra pipeline + `pgbouncer_image` | **no image**: ECR repo `lawbid-pgbouncer` does not exist | `DB_POOL_SIZE` = 3 on prod | FIXED (PR) + owner steps O4, O6 | «мы не будем платить посредникам делаем сами» 24.10, 2026-10-24.md:832 |
| 17 | OpenSearch on when `search.engine` is shadow/engine, off when back to postgres | pipeline | — | pipeline not connected | — | FIXED (PR) + O4 | «когда нашим серверам базам станет сложно» 25.10, 2026-10-25.md:74 |
| 18 | Own TURN on while Cloudflare is down, off 30 min after | breaker | `turn_on_demand` + instance id | **no**: `turn_on_demand=false`, `TURN_ONDEMAND_INSTANCE_ID` empty; alarm `lawbid-prod-turn-primary-health` in ALARM since 04.11 | — | NOT CONFIGURED (calls helper's area; reported, not touched) | «должен выключаться когда клаудфлейр заработает» 26.10, 2026-10-26.md:286 |
| 19 | Bunny / Cloudflare hard-stops | daily usage poll at crit | vendor API keys | yes | not reached | WORKS-IDLE; reacts up to 24 h late (gap G3) | COST_LADDER.md:87-88 |
| 20 | Counters drift sweep | nightly 04:50 | — | yes | no success log line existed (added in PR: «cron job done») | UNPROVEN → logging FIXED (PR) | — |
| 21 | Nightly admin stats snapshot | nightly + while an admin is active | — | yes | «admin summary refresh failed» ×4 (07.11) — admin-speed helper's area | WORKS with failures (reported) | admin-stats-snapshot.md:11 |
| 22 | Q&A ranking snapshot (`reco.qa-snapshot`) | nightly 05:20 | DELETE privilege | — | **failed every night 05.11–08.11**: 42501 permission denied (TRUNCATE) | BROKEN → FIXED (PR) + CI guard | owner R-401 04.11 |
| 23 | Ledger reconcile, retention scrubs, sessions/OTP cleanup, license expiry, case lifecycle sweeps | cron | — | yes | «ledger reconciliation ok» ×7, «legal retention scrub done» ×7, «sessions cleanup finished» ×7, case sweeps ×168 | WORKS | — |
| 24 | Cron schedules self-heal | every 30 s | Redis | yes | `cron_schedulers missing` max 0 over 7 days | WORKS | — |
| 25 | Daily backups + cross-region copy | AWS Backup daily | — | yes | backup + copy jobs COMPLETED 06–08.11; LatestRestorableTime fresh | WORKS | «на все да» 24.10 |
| 26 | Restore test | AWS Backup restore testing | `restore_test_enabled` | **no** restore-testing plan exists | — | NOT CONFIGURED (owner step O8) | AUD N-18 |
| 27 | Alerts by e-mail (SNS) | CloudWatch alarms (150) | confirmed subscription | `lawbid-prod-alerts` confirmed; **`lawbid-prod-critical` PendingConfirmation** | 4 alarms firing now (queue-backlog, slo-push ×2, turn-primary-health) | PARTLY BROKEN (owner step O2) | «в админке появляется тревога и там что надо делать» 24.10, 2026-10-24.md:967 |
| 28 | Ops alert e-mails from the app (status watchdog) | incident open/close | SES production access | **SES in sandbox** (ProductionAccessEnabled false) | every «ops alert email skipped: Email address is not verified» 05–08.11 | BROKEN (owner step O3) — also means users get no e-mail | same |
| 29 | Rollback target `last_good_tag` written after each green deploy | deploy.yml | `ssm:PutParameter` on the deploy role | **no**: IAM simulation `implicitDeny` (also rds:DescribeDBInstances, sns:ListTopics, budgets read) — `infra/bootstrap` not re-applied since 06.10 | SSM value from 28.10 (v2), many deploys since | BROKEN silently → made LOUD (PR) + owner step O1 | — |
| 30 | Daily self-check | self-check.yml | same role rights | — | **red every day** (05–08.11): reads «0 alarms / no topic / no budget» because of AccessDenied | BROKEN → messages fixed (PR, says «нет прав») + O1 | — |
| 31 | Synthetic user flow every few hours | synthetic.yml | repo var `SYNTHETIC_ENABLED=true` | **no** (only DEPLOY_ENABLED set) | every scheduled run «skipped» | NOT CONFIGURED (owner step O7) | — |
| 32 | Terraform drift check | terraform-drift.yml | — | yes | green 08.11 | WORKS | — |
| 33 | Events sink auto-switch to Kinesis | events/day ≥ ceiling | `EVENTS_STREAM_NAME` | empty | flag would flip, nothing published | NO-OP (gap G4) | — |
| 34 | Redis cache node auto | `REDIS_CACHE_URL` | `redis_cache_node` | false | — | NO-OP (gap G5) | 28.10 |
| 35 | Read-replica provision by CPU (app path) | 3 h CPU ≥ 75 % | `OPS_DB_REPLICA_TOGGLE` | not set | — | NO-OP, one-way (gap G6: make it work, keep it) | 25.10 |
| 36 | Shard split / move | admin button; status green/yellow/red | — | — | — | PREPARE+TAP (reason R1) | «сделай в админке кнопкой делить базу» 24.10, 2026-10-24.md:832 |
| 37 | Real-money auto-refund | — | — | OFF by rule | — | OFF on purpose (STRICT_RULES.md:11) | rule 05.11 |

## Deliberately not fully automatic (and why)

- **R1. Moving tenants between shards / splitting the database.** Irreversible data move across
  databases; a wrong automatic split (hot key, wrong family) cannot be undone without a second move
  under load. Big platforms do the same: Vitess/PlanetScale «MoveTables» and Shopify pod moves are
  operator-started, the tooling prepares and verifies; Instagram/Notion shard splits were planned
  events. Here: the plan is prepared automatically (shard-growth status + split plan), one tap
  starts it, the move tick finishes it by itself.
- **R2. «Завершить» (dropping the old table) after a partition swap.** The swap is automatic and
  reversible for `FINALIZE_AFTER_DAYS`; dropping the old copy destroys the rollback path, so it
  stays one tap after the waiting period (pg_partman likewise keeps detached partitions until told).
- **R4. Converting the security journals (audit_log, auth_events, data_access_log).** The online
  runner works as the table owner; owning `audit_log` means being able to disable its
  tamper-evident chain trigger. They are append-only and tiny today (far below 50 M rows); when one
  nears the threshold the growth signal on «Здоровье» says so and a reviewed migration converts it
  (pg_partman and GitLab do the same for audit tables: converted by a migration, not by a runtime role).
- **R3. Turning WAF bot control / Macie / Synthetics / Container Insights OFF over budget.** See the
  pipeline section.

## Owner steps (once, in this order)

- **O1. Re-apply `infra/bootstrap`** (gives the deploy role what the code already declares:
  ssm Get/Put on `/lawbid-prod/deploy/*`, rds:DescribeDBInstances / CreateDBSnapshot, sns:ListTopics,
  budgets read). Fixes #29, #30, the pre-migration snapshot and the backup check in deploys.
  ```
  cd infra/bootstrap && aws login && terraform init && terraform plan -out=b.plan
  # read the plan: only aws_iam_role_policy changes on lawbid-prod-github-deploy
  terraform apply b.plan
  ```
  After the next deploy: `aws ssm get-parameter --name /lawbid-prod/deploy/last_good_tag` = that SHA.
- **O2. Confirm the critical alerts e-mail:** open the AWS mail «AWS Notification - Subscription
  Confirmation» for topic `lawbid-prod-critical` → **Confirm subscription**. If it is gone:
  AWS Console → SNS → Topics → `lawbid-prod-critical` → Subscriptions → select the pending one →
  **Request confirmation**.
- **O3. SES out of the sandbox:** AWS Console → Amazon SES → Account dashboard → **Request production
  access** (Mail type: Transactional; website https://lawbid.dev; describe sign-up / password
  reset / alerts). Until approved, SES mails only verified addresses (the app's alert e-mails and
  user e-mails fail).
- **O4. Connect the infra pipeline** (makes rows 12, 15, 16, 17 act by themselves):
  `docs/runbooks/infra-from-admin.md` steps 1–4 (GitHub App `lawbid-infra`, admin → Интеграции,
  `infra_apply_enabled = true` + `terraform apply` in `infra/bootstrap`, GitHub environment
  `infra-apply`). `infra.auto_mode` is `auto` by default; `infra.dry_run` now only guards the
  admin's own buttons.
- **O5. Proposal for the next prod `terraform apply`** (coordinator applies after showing the plan):
  `partition_role_enabled = true` in `terraform.tfvars` (or let the pipeline do it). The plan adds
  `random_password.partition`, secret `lawbid-prod/PARTITION_DB_PASSWORD` + version, and new task
  definition revisions of worker and migrate (extra secret). Then run the migrate task once
  (`scripts/deploy/run-migrations.sh lawbid-prod <running SHA>`) or wait for the next deploy: it
  sets the role's password (`prisma/ensure-partition-login.mjs`). Check on «Масштаб»: the partition
  cards show «можно начать» instead of «нет входа».
- **O6. PgBouncer image:** GitHub → Actions → **Build PgBouncer** → Run workflow (main); then put the
  printed `pgbouncer_image = "<ECR>/lawbid-pgbouncer:<tag>"` into `terraform.tfvars`. Without it any
  `db_pooler_enabled = true` plan fails its precondition (the automation then reports «не получилось»).
- **O7. Synthetic checks:** GitHub → Settings → Secrets and variables → Actions → Variables →
  **New repository variable** `SYNTHETIC_ENABLED` = `true`.
- **O8. Restore test:** `restore_test_enabled = true` in `terraform.tfvars` (AWS Backup restore
  testing, monthly, a few dollars).

## Gaps left for the next PRs (ordered)

- **G1.** `economy.service` re-sends MinCapacity = `OPS_MIN_TASKS` every 5 min (`registerMax`), which
  undoes the night scale-down scheduled action and any `api_min_tasks` above `min_tasks`.
- **G2.** `hidden.autoscale_lambdas` switch writes only the DB Lambda's SSM mode, not Redis.
- **G3.** Bunny / Cloudflare hard-stops ride on the DAILY usage poll (up to 24 h late); poll hourly
  when above the warning level.
- **G4.** `events.sink=auto` flips without `EVENTS_STREAM_NAME`: add `events_stream_enabled` to the
  pipeline with the same hysteresis.
- **G5.** `cache.redis_mode=auto` without `redis_cache_node`: same.
- **G6.** `db.replica_provision` app path is one-way and gated off: make it work (switch `db_replica_toggle` on through the pipeline, add the switch-off after a quiet window). Owner rule 08.11: nothing already built is removed, hidden or retired; G4–G6 are made to work in later PRs.
- **G7.** Terraform sizes the direct pool from `db_autoscale_min_class` (safe at the smallest size)
  and the full 2 × (50 + 20) task peak → 3 per task. The cure is the pooler (#16, now automatic).
  A `data "aws_db_instance"` for the live class is NOT safe for the pool (the autoscaler may shrink
  the database later while tasks keep their pool); it is fine for the ceiling check only.
- **G8.** TURN on-demand and the firing `turn-primary-health` alarm (calls helper).
- **G9.** `admin summary refresh failed` (admin-speed helper).
- **G10.** HA auto has no money check of its own (≈ $26 a month; covered by the economy allowance only
  indirectly).

## Verification of this branch

Unit: `infra-auto.logic.spec.ts`, `infra-auto.service.spec.ts` (dry run of the whole pass with
fakes: hysteresis, lock, money ceiling, missing GitHub App, mode off), `infra-change.service.spec.ts`
(automatic request is real and confirms itself; unsafe plan waits; an admin cannot use the auto
flag), `ha-auto.service.spec.ts` (busy → copies at once, never removed while busy),
`partition-url.spec.ts`, `qa-snapshot.service.spec.ts`, `architecture/sql-safety.spec.ts` (no
TRUNCATE on the app role). Node: `scripts/ensure-partition-login.test.mjs`. e2e:
`test/partition-ready.e2e-spec.ts` (every monthly table passes the runner precheck on the migrated
schema).
