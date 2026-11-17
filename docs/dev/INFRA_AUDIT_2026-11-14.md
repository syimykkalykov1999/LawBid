# Infra audit 14.11.2026 — servers, database, dependencies

Scope: everything except «Авто» up/down, PgBouncer-on-Fargate, the queue-backlog alarm and PR #1027 (another helper).
Method: code and Terraform reading (file:line below), plus two live read-only calls with `AWS_PROFILE=lawbid-monitor` before the session's safety check stopped further AWS reads (see «Not verified live»). Rule: an item is changed only with proof; everything else is «exists, OK — untouched».

Status: **OK** = exists and fits, untouched · **BUG** = proven defect, fixed in this PR · **RISK** = works today, breaks at a stated condition · **OWNER** = needs the owner (Terraform apply, money, AWS console) · **CHECK** = could not be verified live.

## 1. RDS Postgres

| Item | Evidence | Status | Fix / step |
|---|---|---|---|
| Automated backups, retention | live: `BackupRetentionPeriod 14`, window `03:10-03:50`; `infra/envs/prod/variables.tf:403-407` | OK | — |
| PITR | live: `LatestRestorableTime 2026-11-15T00:17:37Z` (minutes behind) | OK | — |
| Deletion protection | live: primary `true`; replica `false` (a replica holds no unique data) | OK | — |
| Final snapshot / kept backups | `modules/postgres/main.tf:331-334` (`skip_final_snapshot=false`, `delete_automated_backups=false`) | OK | — |
| AWS Backup daily + copy to us-west-2, 35 days | `modules/backup/main.tf:141-207`; restore test plan `:282-320` | OK | — |
| Backup vault lock (immutable backups) | `vault_lock_mode="off"` `infra/envs/prod/variables.tf:759-762` | RISK | OWNER: set `backup_vault_lock_mode="governance"` (reversible) — protects backups from a stolen admin key |
| Cross-region PITR | `rds_cross_region_backups=false` `variables.tf:836-843` → other-region RPO ≈ 24 h (daily copy only) | RISK | OWNER decision (cost ≈ storage of WAL copy) |
| Multi-AZ | live: `MultiAZ false` (primary and replica); `variables.tf:413-417`, in `ignore_changes` | OWNER | planned by the owner; KNOWN_ERRORS 78/129 are outages during class changes without it. The failover drill (`FAILOVER=1`) waits for it |
| Storage autoscaling | live: 50 GB allocated, max 500 GB, gp3, encrypted | OK | — |
| Parameter group | live (user-set): `log_min_duration_statement 500`, `log_lock_waits 1`, `deadlock_timeout 1000`, `log_temp_files 10240`, autovacuum scale factors 0.05/0.05/0.02, `shared_preload_libraries pg_stat_statements` | OK | — |
| statement / idle-in-transaction / lock timeouts | per role `lawbid_app`: 30 s / 60 s / 10 s — `infra/postgres/role-settings.sql:10-12` (manual SQL) | OK (CHECK live: `SELECT rolname, rolconfig FROM pg_roles`) | — |
| max_connections vs pools | not set (RDS formula LEAST(mem/9531392, 5000) ≈ 790-900 for db.t4g.large). Primary goes through PgBouncer (fixed server pool). **Read replica is reached directly** with `DB_POOL_SIZE` = 10 per task (`apps/api/src/prisma/prisma-read.service.ts:270-276,315-318`; `infra/modules/stack/main.tf:2101-2105` sets only `DB_REPLICA_HOST`) | BUG (latent) | **Fixed in this PR**: `DB_READ_POOL_SIZE = direct_pool_size` (the same 3..10 budget the primary uses without a pooler). Peak at the 100+100 task ceilings: 4000 → 1200. Long-term: the replica behind a pooler (`DB_REPLICA_POOLER_HOST`, owner of PgBouncer) |
| Slow queries now | Performance Insights on, 7 days (`modules/postgres/main.tf:340-345`) | CHECK | live PI read was stopped by the safety check |
| Engine version | live: `16.13`, auto minor on; newest offered: `16.15` (minor), `18.6` (major), `17.11` | OWNER | minor 16.15 comes by itself in the maintenance window. Major 18: plan below |

### Postgres major upgrade plan (16 → 18), owner steps
1. Staging first: `aws rds create-blue-green-deployment --source <staging-arn> --target-engine-version 18.6 --target-db-parameter-group-name <new pg18 group>` (needs a `postgres18` parameter group with the same values as above, added to `modules/postgres` as code — PR on request).
2. Run the API e2e suite against the green copy (`DATABASE_URL` → green endpoint) and `scripts/ops/restore-drill.sh DB_ID=lawbid-staging-postgres` against it.
3. Switchover in staging, watch 24 h (db-slow, db-connections alarms).
4. Prod: take a manual snapshot, the same blue/green, switchover off-peak (≈ 1 min of writes paused), keep blue 48 h, then delete it.

## 2. Redis / ElastiCache

| Item | Evidence | Status | Fix / step |
|---|---|---|---|
| Eviction policy for BullMQ | `maxmemory-policy noeviction` `modules/redis/main.tf:30-37,128-129`; cache-only node `allkeys-lru` (`stack/main.tf:1328-1342`) | OK | — |
| Snapshots | `snapshot_retention_limit=1` (in `ignore_changes`) `modules/redis/main.tf:169,187` | OK (CHECK live) | — |
| Failover / Multi-AZ | `redis_replicas=0` `variables.tf:92-96`; `automatic_failover` = replicas>0 | RISK / OWNER | single node until the API's ha-auto adds one; owner decision with RDS Multi-AZ |
| Encryption, AUTH | transit + at rest + AUTH token rotate `modules/redis/main.tf:162-166` | OK | — |
| Engine version | `redis 7.1` `modules/redis/main.tf:119-121,150-153`; newest on ElastiCache: Valkey 8.x | OWNER | in-place engine switch Redis 7.1 → Valkey (ElastiCache supports it without data loss); test on staging, then prod off-peak. Code change = `engine`/`engine_version`/family in the module (PR on request) |

## 3. ECS api / worker

| Item | Evidence | Status |
|---|---|---|
| Health checks | api `/health/live` container + ALB (15 s, 2/3), grace 60 s; worker heartbeat file `modules/ecs/main.tf:661-667,712-718,869` | OK |
| Circuit breaker + rollback | enable + rollback on all services `modules/ecs/main.tf:904-916,967-971,1046-1050`; alarm rollback on (`variables.tf:675-677`) | OK |
| Canary + automatic rollback (#1052) | `scripts/deploy/canary.sh`, `.github/workflows/deploy.yml:441-447,502-518` | OK (RISK: a 5-min bake is one 300 s period of `api-5xx-ratio`; a few-% canary is diluted — tune in a later PR if wanted) |
| Autoscaling | api CPU 60 % + requests/target + open sockets; worker CPU + queue math `modules/ecs/main.tf:1196-1347` | OK |
| Task size vs use | CHECK — live Container Insights read stopped. Worker task 1024 MB with a clamav sidecar `memoryReservation 2560` (`modules/ecs/main.tf:117,727`): the prod `worker_memory` must be bigger than 1024 (tfvars is in Secrets Manager) | CHECK |
| Graceful shutdown | `enableShutdownHooks` api/worker; socket.io drain 35 s (`realtime.gateway.ts:473-508`); BullMQ `closeWorker` with a 95 s budget (`queue-hardening.ts:116-164`); stopTimeout api 60 / worker 120 | OK |
| Spot interruption | Spot base 1 on-demand + weight 4 Spot; the normal SIGTERM path drains; placement failures fall back (`modules/spot-fallback`) | OK (RISK: api min 2 → one interruption = half of the api; night mode can leave 1 on-demand task — owner's cost choice) |
| Platform version | `LATEST` on every service | OK (newest by definition) |
| Node runtime | `node:26.13.1-alpine@sha256` both stages `apps/api/Dockerfile:3,27` | OK (version checks: Linux agent verall) |

## 4. External dependencies

| Dependency | Timeout | Retry | Breaker | User sees when down | Status |
|---|---|---|---|---|---|
| Twilio SMS | 8 s `withTimeout` + SDK 10 s `twilio-sms.provider.ts:30,60-62` | 2 tries on 5xx/429/network | `twilioBreaker` 5/60 s | open breaker → 503 `SERVER_BUSY` | **BUG fixed**: a timed-out send was sent again (`withTimeout` only stops waiting; the first request can still deliver) → the code texted and billed twice. Now no retry after our own time limit |
| Stripe | 20 s × SDK 2 retries `stripe-breaker.ts:21,62-64` | SDK | `stripeBreaker` | 503 `PAYMENTS_NOT_CONFIGURED` (translated) | OK; webhooks idempotent (unique event id, DLQ) |
| Cloudflare R2 | **none** `common/secrets/r2-client.ts:24` | SDK 3 | none | hung bucket → request held until the server timeout | **BUG fixed**: connect 3 s / idle 30 s on the HTTP handler (the SES pattern) |
| AWS S3 (documents, media) | **none** `s3-storage.service.ts:208` | SDK 3 | none | same | **BUG fixed**: same limits |
| Bunny video | 8 s on headers only; timer cleared before `res.json()` `bunny-stream.client.ts:199,215,347-364` | none | `bunnyBreaker` | — | **BUG fixed**: the body is read under the same limit |
| Cloudflare TURN / SFU | 1.5 s / 8-12 s budgets, Redis-shared breaker | 1 | yes | 503 `CALL_MEDIA_UNAVAILABLE` → own TURN | OK (best covered, hang tests exist) |
| OpenSearch | 5 s (admin), 800 ms search box | 0 (admin) | own breaker | silent fallback to Postgres | OK (note: breaker 5/30 s in code `search-switch.provider.ts:18-19`) |
| FCM | 10 s fetch; OAuth token fetch without own limit `fcm-push.sender.ts:129` | queue 4 tries | `fcmBreaker` | nothing (background) | RISK (gaxios has its own default; not proven to hang) |
| APNs VoIP | 8 s per stream | 1 | none | FCM alert instead | OK |
| SES / SMTP | 10 s + 3 s connect | none (no double mail) | yes | 503 `SERVER_BUSY` | OK |
| Sentry | async transport | — | — | nothing | OK |

Open (not changed, needs a decision): provider errors other than timeouts/breaker fall to `500 INTERNAL_ERROR` (`all-exceptions.filter.ts:171`) and the app shows a generic text; `SERVER_BUSY` has no own translation (`apps/mobile/lib/core/l10n/api_error_text.dart`).

## 5. Alarms

Exists and wide (RDS CPU/storage/memory/latency/connections, replica lag, Redis CPU/memory/connections/replication, ALB 5xx/p95/unhealthy, no-running-tasks, BullMQ failed, Stripe DLQ, OTP/call/push/pay SLO burn, TURN, OpenSearch, backups stale, uptime) — `infra/modules/monitoring/*.tf`, `growth/main.tf:209,441`. Gaps:

| Gap | Evidence | Status |
|---|---|---|
| Nobody's phone rings | critical topic → PagerDuty only if `pagerduty_https_endpoint` set (default null) `monitoring/main.tf:24-34,254-268`; email today | OWNER: PagerDuty (or Opsgenie) endpoint |
| Slack likely receives nothing | SNS `https` subscription straight to `slack_webhook_url` `monitoring/main.tf:205-210`; a Slack incoming webhook cannot confirm an SNS subscription | CHECK (console: subscription «PendingConfirmation»?) → fix via AWS Chatbot or the existing `alarm_hook` Lambda |
| A full Twilio outage fires no alarm | `otpSent` counted only on success (`otp.service.ts:307-309`) → the OTP SLO has no events | RISK (next PR: a failure counter into the existing SLO) |
| ECS running < desired / crash loop | only «zero running» exists | RISK |
| Admin service CPU/memory/no-task outside deploys | none | RISK |

## 6. «Учебное восстановление базы» (restore drill) — what it does, cost

`scripts/ops/restore-drill.sh` (runbook `docs/runbooks/restore-drill.md`), from the owner's Mac with AWS CLI:
1. Finds the newest automated snapshot (default), the latest restorable second (`MODE=pitr`) or the newest AWS Backup recovery point (`MODE=backup-vault`; `DR=1` = the copy in us-west-2).
2. Restores it into a NEW instance `lawbid-drill-<date>` (db.t4g.micro, single-AZ, not public, same subnet/security groups). **The live database is never touched.**
3. Sets a fresh random master password on the copy.
4. Runs a smoke query from inside the VPC as a one-off ECS task of the `migrate` task definition: row counts of main tables, newest row.
5. Deletes the copy (also on error / Ctrl-C), no final snapshot; `KEEP=1` keeps it.
6. Prints the log row (RTO, RPO).
Cost: one db.t4g.micro for 30-60 min ≈ $0.05 + a few cents of Fargate. Last run: 2026-10-25, backup-vault, RTO 20 min (runbook table line 133). `FAILOVER=1` is a separate test that reboots the LIVE instance with failover (real ~1 min outage), needs Multi-AZ, `CONFIRM_OUTAGE=yes` and `ALLOW_PROD=1` — not available until Multi-AZ is on.

## 7. Versions (current → newest)

| Piece | Current | Newest | Plan |
|---|---|---|---|
| RDS Postgres | 16.13 (live) | 16.15 minor; 18.6 major | minor automatic; major: plan in §1 |
| ElastiCache | Redis 7.1 | Valkey 8.x | §2 |
| OpenSearch | OpenSearch_2.15, t3.small.search ×4 (`modules/growth/main.tf:356-412`) | 2.19 / 3.x | OWNER: in-place blue/green by AWS; staging first |
| ECS platform | LATEST | — | OK |
| ALB TLS policy | `ELBSecurityPolicy-TLS13-1-2-2021-06` (`modules/alb/main.tf:354`) | `…-TLS13-1-2-Res-2021-06` (no CBC ciphers) | small PR on request (drops very old clients) |
| OpenSearch TLS | `Policy-Min-TLS-1-2-2019-07` | `Policy-Min-TLS-1-2-PFS-2023-10` | with the engine upgrade |
| Node in images | 26.13.1 | — | Linux agent verall |
| Terraform AWS provider | 5.100.0 (`~> 5.60`) | 6.x | separate PR + plan review (6.x has breaking changes) |
| Terraform binary | validate 1.9.8, apply/drift `>=1.9` (floats) | — | RISK: pin apply/drift to the validate version |

## Not verified live
After `describe-db-instances`, `describe-db-parameters --source user`, `describe-db-engine-versions` and `describe-pending-maintenance-actions` (no pending actions), further read-only AWS calls were refused by the session's safety check. Not read live: ElastiCache, ECS/Container Insights, ALB, Performance Insights top SQL, SNS subscriptions, CloudWatch alarm states, the prod tfvars in Secrets Manager.

## This PR
1. R2 and S3 clients: connect 3 s / idle 30 s (`STORAGE_REQUEST_HANDLER`, `common/secrets/r2-client.ts`).
2. Twilio: no second send after our own time limit (`isTwilioRetryable`).
3. Bunny: the body is read under the 8 s limit.
4. Terraform (owner applies): `DB_READ_POOL_SIZE` for the read replica from the direct-connection budget.
Tests (failing first, then green): `twilio-sms.provider.spec.ts` (a timed-out send is not sent a second time), `bunny-stream.timeout.spec.ts`, `r2-client.timeout.spec.ts`.
