---
status: "accepted"   # built in PR #334 for audit_log and auth_events
date: 2026-10-24
decision-makers: owner + Claude
---

# Monthly partitioning of the biggest append-only tables

## Context and problem statement

Tables such as messages, notifications, audit log and view events only grow.
Deleting old rows from one huge table is slow and bloats indexes; the sharding plan
says partitioning these first buys the most headroom.

## Decision drivers

- Cheap retention: drop a month instead of deleting millions of rows.
- Keep indexes and vacuum small.
- No behaviour change for the app.

## Considered options

- Monthly range partitions, created by our own daily job (chosen; `pg_partman` was considered but RDS extension setup and a second config surface were not worth it for two tables)
- Monthly range partitions managed by `pg_partman` once a table passes about 50M rows
- Never partition, rely on shards
- Move history to cold storage only

## Decision outcome

Accepted and built (PR #334, 2026-10-25; made expand-only 2026-10-26, perf review R-20):
migration `20261107114000_partition_audit_auth` converts nothing, it only adds the month
upkeep functions, so a deploy never locks or copies a table. `audit_log` and `auth_events`
are converted by the same opt-in online runner as every other table. The daily job
`partition.maintain` pre-creates two future months. Other tables are converted later
through the admin cards (online runner `apps/api/src/partitioning/partition-runner.ts`:
pause / resume / abort / undo by rename until «Завершить»), off until the owner sets
`PARTITION_DATABASE_URL`. `messages`, `notifications` and `search_query_log` are NOT
range-partitioned by time (their FKs and unique keys need the partition column); messages
and notifications get HASH partitions by `conversation_id` / `user_id` in a follow-up PR.
Trigger for the next tables: the `table_growth` health signal at 50M rows.
Partition key is time; with sharding the table is partitioned inside each shard.
Measured: deep audit pages 91 ms → 5.7 ms on 1.5M rows; short queries within noise.

### Consequences

- Good: retention jobs become `DROP`/detach of old partitions.
- Bad: primary keys and unique indexes must include the partition column; the migration safety check and Prisma need care. No extension needed (own job instead of `pg_partman`).
- Confirmation: `partition-runner.spec.ts`, `partition-runner.int.spec.ts`, `sh scripts/ops/partition-selftest.sh`; the `table_growth` signal and the admin «Масштаб» cards.

## More information

[TABLE_PARTITIONING_READY.md](../architecture/TABLE_PARTITIONING_READY.md), runbook [table-partitioning.md](../runbooks/table-partitioning.md), [BENCHMARK_BIG_APPS.md](../architecture/BENCHMARK_BIG_APPS.md), [SHARDING_READY.md](../architecture/SHARDING_READY.md) section 9. Back-filled 2026-10-25, accepted the same day with PR #334.
