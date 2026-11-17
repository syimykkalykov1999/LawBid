# PostgreSQL 16 → 18 and Redis OSS 7.1 → Valkey 9.1 (runbook)

Owner 15.11: «делай обновы сейчас». Two admin switches («Лестница расходов»): `aws.postgres_major` and `aws.valkey`. Each is one 2FA apply.

## PostgreSQL 16 → 18 (`aws.postgres_major`)

**Method: AWS RDS Blue/Green, run by AWS CLI commands copied from the AWS user guide** (`scripts/infra/rds-major-upgrade.sh`). The guide pages: «Creating a blue/green deployment», «Switching a blue/green deployment», «Limitations and considerations».

**Why not Terraform `blue_green_update`:** with AWS provider 6.72 it (1) cannot be used when the instance has read replicas (provider docs, «Low-Downtime Updates»), and prod has `lawbid-prod-postgres-replica-1`; (2) after the switchover it deletes the old server with `SkipFinalSnapshot=true` (`internal/service/rds/instance.go` v6.72.0, step «Deleting Blue/Green Deployment source»), so there is no way back.

**What the 2FA apply does:**
1. Terraform creates the `lawbid-prod-postgres18` parameter group (the same custom parameters as `…-postgres16`) and sets `rds.logical_replication = 1` on `…-postgres16`. Logical replication is the AWS prerequisite for a major-version Blue/Green. Terraform never upgrades the server in place: the version in the config follows the version the server actually runs (`data.aws_db_instance.primary` in `modules/stack`).
2. Part 1 (`infra-apply.yml`) does three things:
   - It reboots the database once so the static parameter takes effect. **The database is gone for about 1 minute.**
   - It runs `create-blue-green-deployment` with the newest 18.x that RDS allows from the running version (18.6 on 15.11) and `--target-db-parameter-group-name lawbid-prod-postgres18`.
   - It waits until the green copy is `AVAILABLE`. The read copy is created too. The app keeps working during this step, which takes about 20–60 minutes.
3. Part 2 runs `switchover-blue-green-deployment --switchover-timeout 300`.
   - Writes stop and connections drop. AWS gives the downtime as «typically under a minute». The names and endpoints stay the same, so the app needs no change.
   - If the AWS guardrails find something unsafe (a DDL, lag), AWS rolls back and nothing changes.
4. Terraform state: the green servers have new `DbiResourceId`s, which the AWS provider uses to find a database. The script runs `terraform state rm` + `terraform import` for the primary and each read copy, so the next plan does not try to rename `…-old1` back.

**Expected downtime:** about 1 min (reboot) + about 1 min (switchover).

**Do not, while it runs:**
- Do not deploy, because migrations are DDL.
- Do not change partition modes.
- Do not start shards or a «Разделить базу».

AWS replicates no DDL or DCL (GRANT) to green, and the deployment then goes to `Replication degraded`. Nothing is lost: delete the deployment with its green databases and press again.

**Checked before (15.11, local postgres:18.7 and AWS read-only):**
- All 212 migrations and the CONCURRENTLY indexes apply on 18, and `prisma migrate diff` finds no drift.
- The full API e2e passes on postgres:18.7 + MinIO with Valkey 8.1.11 (1,222 tests; one known throttler flake, stage-5-5, passed on retry) and again with Valkey 9.1.3 (1,219 tests, 0 failed, no flakes), 3 shards each.
- PgBouncer 1.24.0 (our image) connects to 18 over TLS + SCRAM, and named prepared statements work in transaction mode.
- Every table has a primary key. There are no unlogged tables, large objects or materialized views (all AWS logical-replication limits).
- Extensions on RDS 18.x: pg_trgm 1.6, unaccent 1.1 and pg_stat_statements 1.12 are available.
- Every class of the db-autoscale ladder (t4g.micro…r7g.2xlarge) can be ordered on 18.6, and `max_connections` and `shared_buffers` have the same default formulas in postgres18.

**Rollback:**
- The old server `lawbid-prod-postgres-old1` (16.13) and `lawbid-prod-postgres-replica-1-old1` are kept and stay read-only. IAM `KeepThePrimaryDatabase` still denies deleting them.
- To go back:
  1. Set `default_transaction_read_only = 0` on the old server's group.
  2. Rename the 18 server, then rename `-old1` to `lawbid-prod-postgres` (RDS console → Modify → identifier).
  3. Re-import the state the same way.
- Writes made after the switchover exist only on 18.
- The old servers cost the same as the primary until the owner deletes them. Delete them after 7 calm days in the console. They hold the 16.x PITR history.

**Owner, once before the first use:** `infra/bootstrap` apply. The `DatabaseMajorUpgradeBlueGreen` statement adds `rds:CreateBlueGreenDeployment`, `SwitchoverBlueGreenDeployment`, `DescribeBlueGreenDeployments`, `PromoteReadReplica` and `RebootDBInstance`. These are the actions in the AWS guide «Authorizing access to … blue/green deployment operations».

**By hand (the same steps):**
```
AWS_REGION=us-east-1 DRY_RUN=1 scripts/infra/rds-major-upgrade.sh prepare 18   # read-only check
scripts/infra/rds-major-upgrade.sh prepare 18
(cd infra/envs/prod && terraform init …) ; TF_DIR=infra/envs/prod scripts/infra/rds-major-upgrade.sh switchover 18
```

## Redis OSS 7.1 → Valkey 9.1 (`aws.valkey`)

**Version:** 9.1, the newest ElastiCache offers (`describe-cache-engine-versions --engine valkey`, 15.11 18:58Z: 7.2, 8.0–8.2, 9.0, 9.1; family `valkey9`). AWS What's New of 23.06.2026 says 9.1 is GA. The AWS cross-engine guide upgrades Redis OSS straight to Valkey 9.0 with the same `modify-replication-group` call. In provider 6.72, redis → valkey is never a replacement, whatever the version (`customizeDiffEngineForceNewOnDowngrade`), and 7.1 → 9.1 is an upgrade.

**Prod default since 15.11: `redis_engine = "valkey"`, so the next apply moves it.** Method: in place, as the AWS user guide «Upgrading engine versions including cross engine upgrades» does it (`modify-replication-group --engine valkey --engine-version … --cache-parameter-group-name …`). The provider sends the same call (`replication_group.go` v6.72: redis → valkey is not a replacement).
- The endpoint stays the same and only the node IPs change. Writes pause for the failover, which AWS says lasts «a few seconds».
- Valkey nodes cost 20 % less. These are AWS Price List API prices of 15.11, now used by the redis-autoscale table (`node_hourly.valkey`) and by the API `REDIS_TIERS`. For a pair: t4g.micro $19, t4g.small $37, t4g.medium $76, r7g.large $256, r7g.xlarge $510, r7g.2xlarge $1020.
- 15.11 fix: `apply_immediately` is now true on Valkey. With false, AWS keeps the engine change for the Sunday window while the same apply deletes the `redis7` group still in use, and the apply goes red.
- Same parameter: `maxmemory-policy noeviction`, which is dynamic. AWS requires the same static parameters, and there are none.
- Checked on valkey/valkey:9.1.3 (and before on 8.1.11): the full API e2e passes. It covers BullMQ, ioredis, rate limits and realtime.
- Every ladder node type is offered for Valkey (t4g.micro/small/medium and r7g.large/xlarge/2xlarge; r8g as well).
- Neither the redis-autoscale Lambda nor the app has any engine-specific code. ModifyReplicationGroup / ListAllowedNodeTypeModifications and the ElastiCache metrics are the same for Valkey. Every node class of the ladder is offered for Valkey.

**Rollback:** AWS goes back to Redis OSS only from Valkey 7.2. From 9.1 the only way back is a new cache from a snapshot. The admin refuses «Выкл»: the plan would replace the replication group, which `FORBIDDEN_DESTROY` blocks.

## OpenSearch 2.15 → 2.19 → 3.7 (`aws.opensearch_2_19`, then `aws.opensearch_3`)

**16.11 update: there is no domain to upgrade.** «Авто» switched `aws.opensearch` off at 03:13Z on 16.11, and `aws opensearch list-domain-names` is empty. `growth.opensearch_engine_version` now defaults to `OpenSearch_3.7`, so the next «Поисковый движок» Вкл (or «Авто») **creates the domain straight on 3.7**. Nothing has to be upgraded and the owner needs no extra step. The API then fills the empty domain by itself: the bootstrap creates the templates, the `-v1` index and both aliases, and the reindex backfills it. That is the path the real-engine specs below run on 3.7.0. The two rows are now «on» by default (Выкл is never offered: it would be a step back). The hop path below (2.15 → 2.19 → 3.7, `FORBIDDEN_REPLACE`, 4 h session) stays only for a domain that already runs 2.x.

**Version:** 3.7, the newest Amazon OpenSearch Service offers (`aws opensearch list-versions`, 15.11: 3.7, 3.5, 3.3, 3.1, 2.19 …). AWS has no direct jump: `get-compatible-versions --domain-name lawbid-prod-search` gives only 2.17 and 2.19, and the AWS guide «Upgrading Amazon OpenSearch Service domains» says 2.x must go to 2.19 first, then to 3.x. So two switches, one owner 2FA apply each, in this order.

- **Method:** AWS in-place upgrade (pre-check, automatic snapshot, blue/green). The address stays the same and search keeps working; AWS says it takes 15 minutes to several hours. In-place costs nothing extra.
- **Never a replacement:** provider 6.72 replaces the domain when the target is not in `get-compatible-versions` (a skipped hop or a step back). `FORBIDDEN_REPLACE` makes the plan fail (exit 3) and the admin refuse it. So turn on `aws.opensearch_3` only after `aws.opensearch_2_19` finished, and never turn either one back off.
- **Session:** Terraform waits for the upgrade inside the apply (timeout 240 min). For these two items infra-apply asks for a 14 400 s AWS session (the deploy role allows 14 400 s, `aws iam get-role`, 15.11).
- **Nodes:** t3.small.search is offered on 2.19 and 3.7 (`list-instance-type-details`, 15.11), so the size and the price stay the same. The «Авто» rows (nodes 2 ↔ 4, the engine on by people count) do not touch the version. They wait in the same `infra-apply` queue while an upgrade runs.
- **App:** the API talks to the engine with its own small REST client (plain fetch), not opensearch-js. It uses `_search`, `_mget`, `_bulk` (external versions), `_reindex`, `_tasks`, `_aliases`, `_index_template`, `_cat`. None of these appear in the 3.0 breaking changes list. There are no k-NN or `index.store.hybrid.mmap.extensions` settings, no nested queries, and ids are UUIDs (the 512-byte `_bulk` id limit). The indexes were created on 2.15, so 3.x reads them.
- **Checked on opensearchproject/opensearch:3.7.0 (Lucene 10.4):** `opensearch.integration.spec.ts` and `search-alias.integration.spec.ts` give 12/12. They cover mappings, analyzers, every query, bulk, aliases and the zero-downtime reindex.
- **Before tapping:** JVM memory pressure on the 2 × t3.small averages about 50 % with peaks near 80 % (CloudWatch, 15.11). The AWS pre-check refuses an upgrade above 75 %, and then nothing changes. If it does, wait for a quiet hour and repeat.

**Rollback:** none in place (AWS cannot downgrade). The way back is a new domain from the automatic snapshot, which is owner-only.
